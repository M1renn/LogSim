// Настройки ИИ-провайдера. Все провайдеры используют OpenAI-совместимый
// формат /chat/completions, поэтому провайдер меняется одной настройкой.
import type { AiProvider, AiSettingsPublic, MetaInfo } from '../../shared/types';
import { readJson, writeJson } from '../storage';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export const PROVIDERS: MetaInfo['providers'] = [
  { id: 'offline', label: 'Офлайн-бот (без ИИ, без интернета)', baseUrl: '', model: '', needsKey: false },
  {
    id: 'gemini',
    label: 'Google Gemini (бесплатный тариф)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    needsKey: true,
  },
  {
    id: 'groq',
    label: 'Groq (бесплатный тариф)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    needsKey: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter (модели с суффиксом :free)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemma-4-31b-it:free',
    needsKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama (локальная модель на этом ПК)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    needsKey: false,
  },
  { id: 'custom', label: 'Другой OpenAI-совместимый сервер', baseUrl: '', model: '', needsKey: false },
];

const FILE = 'settings.json';
const DEFAULTS: AiSettings = { provider: 'offline', apiKey: '', model: '', baseUrl: '' };

// Загружаем лениво: в Electron папка данных становится известна только после старта приложения
let loaded: AiSettings | null = null;

export function getSettings(): AiSettings {
  if (!loaded) loaded = { ...DEFAULTS, ...(readJson<Partial<AiSettings>>(FILE) ?? {}) };
  return loaded;
}

export function publicSettings(): AiSettingsPublic {
  const current = getSettings();
  return {
    provider: current.provider,
    model: current.model,
    baseUrl: current.baseUrl,
    hasKey: Boolean(current.apiKey),
  };
}

export function updateSettings(patch: Partial<AiSettings>): AiSettingsPublic {
  const current = getSettings();
  const next: AiSettings = { ...current };
  if (patch.provider && PROVIDERS.some((p) => p.id === patch.provider)) {
    if (patch.provider !== current.provider) {
      const preset = PROVIDERS.find((p) => p.id === patch.provider)!;
      next.baseUrl = preset.baseUrl;
      next.model = preset.model;
    }
    next.provider = patch.provider;
  }
  if (typeof patch.model === 'string' && patch.model.trim()) next.model = patch.model.trim().slice(0, 200);
  if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) next.baseUrl = patch.baseUrl.trim().slice(0, 300);
  // пустая строка ключа = оставить прежний; специальное значение '-' = удалить ключ
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
    next.apiKey = patch.apiKey.trim() === '-' ? '' : patch.apiKey.trim();
  }
  loaded = next;
  writeJson(FILE, next);
  return publicSettings();
}
