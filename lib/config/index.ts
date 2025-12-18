export interface LLMConfig {
  apiKey: string | undefined;
}

export function getLLMConfig(): LLMConfig {
  return {
    apiKey: process.env.GEMINI_API_KEY,
  };
}
