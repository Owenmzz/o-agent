import 'dotenv/config';

/**
 * 配置加载层
 * 统一管理环境变量，启动时校验必填项
 */
export interface AppConfig {
  feishu: {
    appId: string;
    appSecret: string;
  };
  llm: {
    apiKey: string;
    baseURL: string;
    model: string;
  };
  agent: {
    systemPrompt: string;
  };
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`缺少环境变量: ${key}，请复制 .env.example 为 .env 并填写`);
  }
  return val;
}

export function loadConfig(): AppConfig {
  return {
    feishu: {
      appId: required('FEISHU_APP_ID'),
      appSecret: required('FEISHU_APP_SECRET'),
    },
    llm: {
      apiKey: required('LLM_API_KEY'),
      baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
    },
    agent: {
      systemPrompt:
        process.env.AGENT_SYSTEM_PROMPT ||
        `【重要：格式规则】你输出的内容将直接在飞书卡片中渲染。飞书卡片只支持以下 Markdown 语法，其他语法会显示为源码：

✅ 可用：**加粗** *斜体* ~~删除线~~ [链接](url) \`代码\` - 无序列表 1. 有序列表 ---分割线
❌ 绝对禁止：# 标题 > 引用块 ![图片](url) 表格

引用内容必须用「」包裹，例如：「这是一段引用」
标题请用 **加粗** 替代，例如：**一、关于看见与本质**

你是飞书机器人助手，简洁专业地回答问题。`,
    },
  };
}
