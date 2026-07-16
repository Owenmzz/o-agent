import OpenAI from 'openai';
import type { AppConfig } from '../config.js';

/**
 * Agent 层 —— 最小执行管线
 *
 * 对应 OpenClaw 的 runEmbeddedAgent → Agent Loop → LLM Provider
 * 职责：接收历史消息，调用 LLM，返回回复文本
 * 不关心消息从哪来、回复到哪去（那是 Channel 的职责）
 * 不关心 session 路由（那是 Gateway 的职责）
 */

/** 消息格式（OpenAI chat 格式） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentRunOptions {
  /** 系统提示词，覆盖默认 */
  systemPrompt?: string;
  /** 温度，默认 0.7 */
  temperature?: number;
}

export class Agent {
  private client: OpenAI;
  private model: string;
  private defaultSystemPrompt: string;

  constructor(config: AppConfig) {
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseURL,
    });
    this.model = config.llm.model;
    this.defaultSystemPrompt = config.agent.systemPrompt;
  }

  /**
   * 执行一次 LLM 调用
   * @param history 对话历史（不含 system，由本方法注入）
   * @returns 助手回复文本
   */
  async run(history: ChatMessage[], options: AgentRunOptions = {}): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: options.systemPrompt ?? this.defaultSystemPrompt },
      ...history,
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
    });

    const reply = completion.choices[0]?.message?.content;
    if (!reply) {
      throw new Error('LLM 返回空回复');
    }
    return reply;
  }
}
