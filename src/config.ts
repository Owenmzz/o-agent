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
        '你是飞书机器人助手，简洁专业地回答问题。',
    },
  };
}
