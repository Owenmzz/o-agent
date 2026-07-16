import * as lark from '@larksuiteoapi/node-sdk';
import type { AppConfig } from '../config.js';
import type { Gateway } from '../gateway/index.js';

/**
 * Channel 层 —— 飞书双向适配
 *
 * 对应 OpenClaw 的 ChannelPlugin：
 *   - inbound：WS 长连接接收消息（无需公网 IP）
 *   - outbound：交互卡片渲染 markdown + 卡片更新
 *   - normalize：飞书原生格式 → 统一 { sessionId, text }
 *   - dedup：message_id 去重，防止飞书重试投递
 *
 * 职责：对接具体聊天平台，不关心 Agent 逻辑
 */

/** 统一的入站消息格式（对应 OpenClaw 的 ChannelInboundEventContext） */
interface InboundMessage {
  sessionId: string;
  text: string;
  msgType: string;
  raw: unknown;
}

export class FeishuChannel {
  private client: lark.Client;
  private wsClient: lark.WSClient;
  private gateway: Gateway | null = null;
  /** 已处理消息 ID（去重，对应 OpenClaw 的 deduplication） */
  private processedMessages = new Set<string>();
  /** 调试：事件触发计数 */
  private eventCount = 0;

  constructor(config: AppConfig) {
    const { appId, appSecret } = config.feishu;

    // IM API 客户端（用于 outbound 发送消息）
    this.client = new lark.Client({
      appId,
      appSecret,
      appType: lark.AppType.SelfBuild,
    });

    // WebSocket 长连接客户端（用于 inbound 接收消息）
    this.wsClient = new lark.WSClient({
      appId,
      appSecret,
      domain: lark.Domain.Feishu,
    });
  }

  /** 绑定 Gateway，建立 Channel → Gateway 的消息流 */
  attach(gateway: Gateway): void {
    this.gateway = gateway;
  }

  /** 启动 Channel：建立长连接，监听消息 */
  async start(): Promise<void> {
    if (!this.gateway) {
      throw new Error('请先调用 attach(gateway) 绑定 Gateway');
    }

    const dispatcher = new lark.EventDispatcher({}).register({
      // 接收消息事件
      'im.message.receive_v1': async (data: any) => {
        try {
          this.eventCount++;
          const msgId = data?.message?.message_id ?? 'unknown';
          console.log(`[DEBUG] 事件#${this.eventCount} PID=${process.pid} msgId=${msgId} 时间=${new Date().toISOString()}`);

          // 方案 A：消息去重（飞书 LLM 耗时长会触发重试投递，同 msgId 跳过）
          if (this.processedMessages.has(msgId)) {
            console.log(`[Channel] 跳过重复消息: ${msgId}`);
            return;
          }
          this.processedMessages.add(msgId);
          if (this.processedMessages.size > 1000) {
            const oldest = this.processedMessages.values().next().value;
            if (oldest) this.processedMessages.delete(oldest);
          }

          // 过期消息过滤（WS 重连后飞书会重新投递历史未确认事件，跳过超过 60 秒的旧消息）
          const createTime = data?.header?.create_time ?? data?.message?.create_time;
          if (createTime) {
            const ageMs = Date.now() - parseInt(createTime, 10);
            if (ageMs > 60_000) {
              console.log(`[Channel] 跳过过期消息: msgId=${msgId} 年龄=${Math.round(ageMs / 1000)}s`);
              return;
            }
          }

          const msg = this.normalize(data);
          if (!msg) return;
          console.log(`[DEBUG] 处理中 PID=${process.pid} text="${msg.text.slice(0, 40)}"`);

          // 简单命令处理
          if (msg.text.trim() === '/reset') {
            this.gateway!.clearSession(msg.sessionId);
            await this.sendText(msg.sessionId, '会话已重置 ✅');
            return;
          }

          // 方案 B：先发"思考中"卡片，再异步处理 LLM
          // 关键：发完卡片后事件函数立即返回（SDK 发 ack），LLM 异步执行不阻塞
          const cardMsgId = await this.sendThinkingCard(msg.sessionId);
          // 异步处理，不 await —— 让事件函数立即返回，避免飞书重试
          void this.processAsync(msg, msgId, cardMsgId);
        } catch (err) {
          console.error('[Channel] 处理消息失败:', err);
        }
      },
    });

    await this.wsClient.start({
      eventDispatcher: dispatcher,
    });

    console.log('[Channel] 飞书长连接已启动，等待消息...');
  }

  /**
   * 异步处理 LLM 调用并更新卡片
   * 不被事件处理函数 await，独立运行
   */
  private async processAsync(
    msg: InboundMessage,
    msgId: string,
    cardMsgId: string,
  ): Promise<void> {
    try {
      const result = await this.gateway!.handle({
        sessionId: msg.sessionId,
        text: msg.text,
      });

      // LLM 完成，更新卡片为最终回复
      if (cardMsgId) {
        await this.updateCard(cardMsgId, '助手回复', result.reply);
      } else {
        // 卡片发送失败的 fallback：直接发新消息
        await this.sendMarkdown(msg.sessionId, result.reply);
      }
      console.log(`[DEBUG] 回复完成 PID=${process.pid} msgId=${msgId}`);
    } catch (err) {
      console.error('[Channel] 异步处理失败:', err);
      if (cardMsgId) {
        await this.updateCard(cardMsgId, '出错了', '❌ 处理失败，请重试');
      }
    }
  }

  /**
   * 消息归一化：飞书原生格式 → 统一 InboundMessage
   * 对应 OpenClaw 的 Message Normalization 步骤
   */
  private normalize(data: any): InboundMessage | null {
    const message = data?.message;
    if (!message) return null;

    if (message.message_type !== 'text') {
      return null;
    }

    let text = '';
    try {
      const content = JSON.parse(message.content);
      text = content.text ?? '';
    } catch {
      text = message.content ?? '';
    }

    // 去掉 @机器人 的前缀（群聊场景）
    const mentionMatch = text.match(/@_user_\d+\s*/);
    if (mentionMatch) {
      text = text.slice(mentionMatch[0].length);
    }
    text = text.trim();

    if (!text) return null;

    return {
      sessionId: message.chat_id,
      text,
      msgType: message.message_type,
      raw: data,
    };
  }

  /** 构建飞书交互卡片对象 */
  private buildCard(title: string, content: string): Record<string, unknown> {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: title },
        template: 'turquoise',
      },
      elements: [{ tag: 'markdown', content }],
    };
  }

  /**
   * 发送"思考中"卡片，返回卡片消息 ID（用于后续更新）
   * 对应 OpenClaw 的 streaming card 占位
   */
  private async sendThinkingCard(chatId: string): Promise<string> {
    const card = this.buildCard('正在思考...', '⏳ 正在思考，请稍候...');
    const res = await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
    return res?.data?.message_id ?? '';
  }

  /**
   * 更新已有卡片内容（LLM 完成后把"思考中"替换为最终回复）
   * 对应 OpenClaw 的 streaming card update
   */
  private async updateCard(
    cardMsgId: string,
    title: string,
    content: string,
  ): Promise<void> {
    const card = this.buildCard(title, content);
    await this.client.im.message.patch({
      path: { message_id: cardMsgId },
      data: { content: JSON.stringify(card) },
    });
  }

  /** 发送纯文本消息（用于简单提示，如 /reset 回执） */
  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
  }

  /** 发送交互卡片消息（渲染 markdown） */
  async sendMarkdown(chatId: string, content: string): Promise<void> {
    const card = this.buildCard('助手回复', content);
    await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      },
    });
  }
}
