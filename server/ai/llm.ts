// Универсальный клиент для OpenAI-совместимых API (Gemini, Groq, OpenRouter, Ollama и др.)
import type { AiSettings } from './settings';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX_REPLY_CHARS = 900;

export async function chatCompletion(settings: AiSettings, messages: LlmMessage[]): Promise<string> {
  if (!settings.baseUrl) throw new Error('не указан адрес API');
  if (!settings.model) throw new Error('не указана модель');
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: 0.8,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('пустой ответ модели');
  return sanitizeOutput(text);
}

/** Выходной фильтр: убираем служебную разметку и ограничиваем длину */
export function sanitizeOutput(text: string): string {
  let t = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*\*/g, '')
    .trim();
  if (t.length > MAX_REPLY_CHARS) t = `${t.slice(0, MAX_REPLY_CHARS).trimEnd()}…`;
  return t;
}

/** Входной фильтр: длина и управляющие символы */
export function sanitizeInput(text: string): string {
  return String(text ?? '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 500);
}
