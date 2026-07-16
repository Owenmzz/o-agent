import type { Agent, ChatMessage } from '../agent/index.js';

/**
 * Gateway 层 —— Session 路由 + 上下文管理
 *
 * 对应 OpenClaw 的 runAgentAttempt + resolveAgentRunContext
 * 职责：
 *   1. 根据 sessionId 路由到对应会话
 *   2. 维护会话历史（上下文窗口）
 *   3. 派发消息到 Agent，返回回复
 * 不关心消息从哪个渠道来（Channel 的职责）
 * 不关心 LLM 怎么调（Agent 的职责）
 */

/** 会话存储接口（demo 用内存 Map，生产可换 Redis/DB） */
interface SessionStore {
  get(sessionId: string): ChatMessage[] | undefined;
  set(sessionId: string, history: ChatMessage[]): void;
}

/** 内存会话存储 */
class MemorySessionStore implements SessionStore {
  private store = new Map<string, ChatMessage[]>();
  get(sessionId: string) {
    return this.store.get(sessionId);
  }
  set(sessionId: string, history: ChatMessage[]) {
    this.store.set(sessionId, history);
  }
}

export interface HandleRequest {
  sessionId: string;
  text: string;
}

export interface HandleResponse {
  reply: string;
  /** 当前会话历史长度 */
  historyLength: number;
}

export class Gateway {
  private store: SessionStore;
  /** 保留最近 N 轮对话（1 轮 = 1 user + 1 assistant） */
  private maxTurns: number;

  constructor(agent: Agent, maxTurns = 20) {
    this.store = new MemorySessionStore();
    this.agent = agent;
    this.maxTurns = maxTurns;
  }

  /** 依赖注入：Agent 实例 */
  private agent: Agent;

  /**
   * 处理一条入站消息
   * 流程：取 session → 追加 user 消息 → 调 Agent → 追加 assistant 消息 → 裁剪历史
   */
  async handle(req: HandleRequest): Promise<HandleResponse> {
    const { sessionId, text } = req;

    // 1. 取出或初始化会话历史
    const history = this.store.get(sessionId) ?? [];

    // 2. 追加用户消息
    history.push({ role: 'user', content: text });

    // 3. 派发到 Agent 执行
    const reply = await this.agent.run(history);

    // 4. 追加助手回复
    history.push({ role: 'assistant', content: reply });

    // 5. 裁剪历史（保留最近 maxTurns 轮 = maxTurns*2 条消息）
    const trimmed = history.slice(-this.maxTurns * 2);
    this.store.set(sessionId, trimmed);

    return {
      reply,
      historyLength: trimmed.length,
    };
  }

  /** 清空指定会话（可用于 /reset 命令） */
  clearSession(sessionId: string): void {
    this.store.set(sessionId, []);
  }
}
