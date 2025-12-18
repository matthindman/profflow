import { SettingsFile } from '@/types/data';
import { SYSTEM_PROMPT_CORE } from './content';

export async function getSystemPrompt(settings: SettingsFile): Promise<string> {
  const addendum = settings.customPromptAddendum?.trim();
  return SYSTEM_PROMPT_CORE.replace('{{customPromptAddendum}}', addendum || '');
}
