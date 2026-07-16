import { loadConfig } from './config.js';
import { Agent } from './agent/index.js';
import { Gateway } from './gateway/index.js';
import { FeishuChannel } from './channel/feishu.js';

/**
 * 入口：组装三层并启动
 *
 * 架构（仿 OpenClaw）：
 *   飞书消息 → [Channel] → [Gateway] → [Agent] → 回复
 *                  ↑                              |
 *                  └──────── outbound ───────────┘
 *
 * 三层依赖注入，单向数据流：
 *   - Channel 持有 Gateway 引用（attach）
 *   - Gateway 持有 Agent 引用（构造注入）
 *   - Agent 独立，只管 LLM 调用
 */
async function main() {
  console.log('=== 飞书 Agent Demo（仿 OpenClaw 三分层）===\n');

  // 1. 加载配置
  const config = loadConfig();
  console.log('[Config] 配置加载完成');
  console.log(`  - LLM 模型: ${config.llm.model}`);
  console.log(`  - 系统提示: ${config.agent.systemPrompt.slice(0, 30)}...\n`);

  // 2. 构建 Agent（最内层）
  const agent = new Agent(config);

  // 3. 构建 Gateway，注入 Agent
  const gateway = new Gateway(agent, 20); // 保留最近 20 轮

  // 4. 构建 Channel，绑定 Gateway
  const channel = new FeishuChannel(config);
  channel.attach(gateway);

  // 5. 启动 Channel（建立飞书长连接）
  await channel.start();

  console.log('\n[Ready] 在飞书中 @机器人 发消息即可对话');
  console.log('[Tip]   发送 /reset 可重置会话上下文');
  console.log('[Exit]  Ctrl+C 退出\n');
}

main().catch((err) => {
  console.error('[Fatal] 启动失败:', err);
  process.exit(1);
});
