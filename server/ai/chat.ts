// Обработка сообщений игрока в чатах: ИИ-провайдер или офлайн-бот.
import { log, say, type GameState } from '../game/engine';
import { chatCompletion, sanitizeInput, type LlmMessage } from './llm';
import { offlineReply } from './offline';
import { buildSystemPrompt } from './persona';
import { getSettings } from './settings';

const HISTORY = 12;

function authorFor(s: GameState, threadId: string): string {
  const thread = s.threads.find((t) => t.id === threadId)!;
  if (thread.role === 'mentor') return 'Ирина (наставник)';
  if (thread.role === 'driver') return s.trucks.find((t) => t.id === thread.truckId)?.driverName ?? 'Водитель';
  return 'Клиент';
}

export async function handleChat(s: GameState, threadId: string, rawText: string): Promise<void> {
  const thread = s.threads.find((t) => t.id === threadId);
  if (!thread) throw new Error('Чат не найден');
  const text = sanitizeInput(rawText);
  if (!text) return;

  say(s, threadId, 'player', 'Вы', text);

  const settings = getSettings();
  let reply: string;
  let author = authorFor(s, threadId);

  if (settings.provider === 'offline') {
    reply = offlineReply(s, thread, text);
  } else {
    const history: LlmMessage[] = s.messages
      .filter((m) => m.threadId === threadId)
      .slice(-HISTORY)
      .map((m) => ({
        role: m.from === 'player' ? 'user' : 'assistant',
        content: m.from === 'npc' && thread.role === 'client' ? `${m.author}: ${m.text}` : m.text,
      }));
    try {
      reply = await chatCompletion(settings, [
        { role: 'system', content: buildSystemPrompt(s, thread) },
        ...history,
      ]);
    } catch (e) {
      reply = offlineReply(s, thread, text);
      log(s, `ИИ недоступен (${(e as Error).message}) — ответил офлайн-бот`, 'warn');
    }
  }

  // в общем чате клиентов офлайн-бот подписывает реплики названием компании
  if (thread.role === 'client') {
    const m = reply.match(/^((?:SIA|UAB|OÜ|AS) [^:]+):\s*/);
    if (m) {
      author = m[1];
      reply = reply.slice(m[0].length);
    }
  }
  say(s, threadId, 'npc', author, reply);
}
