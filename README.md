# o-agent

> 🤖 Agent 学习实战 demo，当前仅实现了飞书上使用 AI 的功能，后续会一直迭代常用功能，供学习参考

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## ✨ 功能特性

- 📡 **飞书长连接**：基于 WebSocket，无需公网 IP 和域名
- 💬 **智能对话**：支持多轮上下文记忆（默认保留 20 轮）
- 🎨 **卡片交互**：思考中占位卡片 → 完成后自动更新为最终回复
- 🔄 **消息去重**：自动过滤飞书重试投递的重复消息
- ⚡ **异步处理**：LLM 调用不阻塞事件回调，避免飞书超时重试
- 🔌 **国产模型友好**：一行配置切换通义千问、DeepSeek、智谱等

## 🏗️ 架构设计

仿照 [OpenClaw](https://github.com/openclaw/openclaw) 的三分层架构，实现清晰的职责分离：

```
飞书消息 → [Channel] → [Gateway] → [Agent] → LLM API
              ↑                              |
              └──────── 回复卡片 ────────────┘
```

| 层 | 文件 | 职责 |
|----|------|------|
| **Channel** | `src/channel/feishu.ts` | 飞书 WS 长连接接收 + IM API 发送 + 消息归一化 + 卡片渲染 |
| **Gateway** | `src/gateway/index.ts` | Session 路由 + 上下文窗口管理 + 派发到 Agent |
| **Agent** | `src/agent/index.ts` | LLM 调用（OpenAI 兼容接口） |

**设计原则**：三层依赖注入，单向数据流，每层职责单一，可独立替换。

## 🚀 快速开始

### 1. 前置条件

- Node.js 18+
- 飞书企业自建应用（[开放平台](https://open.feishu.cn)）
- LLM API Key（OpenAI 或国产模型）

### 2. 飞书应用配置

1. 访问 [飞书开放平台](https://open.feishu.cn) → 创建企业自建应用
2. 添加「机器人」能力
3. 权限管理 → 开通以下权限：
   - `im:message` — 接收消息
   - `im:message:send_as_bot` — 发送消息
   - `im:message.group_at_msg` — 群聊 @ 消息
4. 事件订阅 → 选择「长连接模式」（无需公网 IP）
5. 记录 `App ID` 和 `App Secret`

### 3. 安装与运行

```bash
# 克隆项目
git clone https://github.com/Owenmzz/o-agent.git
cd o-agent

# 安装依赖
npm install

# 复制配置模板
cp .env.example .env

# 编辑 .env 填入你的配置
# FEISHU_APP_ID=你的飞书App ID
# FEISHU_APP_SECRET=你的飞书App Secret
# LLM_API_KEY=你的LLM API Key

# 启动开发模式（热重载）
npm run dev
```

启动成功后，在飞书中 **@机器人** 发消息即可对话！

### 4. 可用命令

| 命令 | 说明 |
|------|------|
| 直接发消息 | 正常 AI 对话 |
| `/reset` | 清空当前会话上下文 |

## ⚙️ 配置说明

在 `.env` 文件中配置以下环境变量：

```bash
# 飞书应用凭证（必填）
FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# LLM 配置（必填）
LLM_API_KEY=sk-xxxxxxxxxxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1  # 可选，默认 OpenAI
LLM_MODEL=gpt-4o-mini                    # 可选，默认 gpt-4o-mini

# Agent 系统提示词（可选）
AGENT_SYSTEM_PROMPT=你是飞书机器人助手，简洁专业地回答问题。
```

### 接入国产模型

修改 `LLM_BASE_URL` 和 `LLM_MODEL` 即可：

```bash
# 通义千问
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus

# DeepSeek
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 智谱 GLM
LLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
LLM_MODEL=glm-4-flash

# Moonshot (Kimi)
LLM_BASE_URL=https://api.moonshot.cn/v1
LLM_MODEL=moonshot-v1-8k
```

## 📁 项目结构

```
o-agent/
├── src/
│   ├── agent/
│   │   └── index.ts        # Agent 层 - LLM 调用
│   ├── channel/
│   │   └── feishu.ts       # Channel 层 - 飞书适配
│   ├── gateway/
│   │   └── index.ts        # Gateway 层 - 会话管理
│   ├── config.ts           # 配置加载与校验
│   └── index.ts            # 入口 - 组装三层并启动
├── .env.example            # 环境变量模板
├── .gitignore              # Git 忽略规则
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
└── README.md               # 项目文档
```

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| [TypeScript](https://www.typescriptlang.org/) | 类型安全 |
| [tsx](https://github.com/privatenumber/tsx) | 开发热重载 |
| [@larksuiteoapi/node-sdk](https://github.com/larksuite/node-sdk) | 飞书 SDK |
| [openai](https://github.com/openai/openai-node) | LLM API 客户端 |
| [dotenv](https://github.com/motdotla/dotenv) | 环境变量管理 |

## 🗺️ 演进方向

- [ ] **工具调用**：Agent 层接入 function calling，支持天气、搜索等工具
- [ ] **多渠道支持**：抽离 Channel 接口，新增 Telegram / Discord / 微信
- [ ] **持久化存储**：SessionStore 换成 Redis，支持重启后恢复会话
- [ ] **插件系统**：引入 PluginRegistry，支持自定义插件扩展
- [ ] **流式输出**：支持 SSE 流式返回，提升用户体验
- [ ] **管理后台**：Web UI 管理会话、查看日志、配置参数

## 📄 License

[MIT](./LICENSE) © [Owenmzz](https://github.com/Owenmzz)
