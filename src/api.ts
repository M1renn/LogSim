import type {
  AiSettingsPublic,
  GameMode,
  Difficulty,
  MetaInfo,
  PublicGameState,
  QuoteFeedback,
  QuoteInputs,
  SkipReport,
} from '../shared/types';

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
  return data as T;
}

type WithState<T = object> = T & { state: PublicGameState };

export const api = {
  meta: () => request<MetaInfo>('/api/meta'),
  saveInfo: () => request<{ exists: boolean; title: string | null }>('/api/save'),
  newGame: (mode: GameMode, levelId: string | null, difficulty: Difficulty) =>
    request<WithState>('/api/game/new', { mode, levelId, difficulty }),
  continueGame: () => request<WithState>('/api/game/continue', {}),
  turn: (hours = 1) => request<WithState>('/api/game/turn', { hours }),
  skipDay: () => request<WithState<{ report: SkipReport }>>('/api/game/skip-day', {}),
  quote: (orderId: string, truckId: string, inputs: QuoteInputs, price: number) =>
    request<WithState<{ feedback: QuoteFeedback }>>('/api/game/quote', { orderId, truckId, inputs, price }),
  counter: (orderId: string, accept: boolean) =>
    request<WithState<{ message: string }>>('/api/game/counter', { orderId, accept }),
  decline: (orderId: string) => request<WithState>('/api/game/decline', { orderId }),
  read: (threadId: string) => request<WithState>('/api/game/read', { threadId }),
  chat: (threadId: string, text: string) => request<WithState>('/api/chat', { threadId, text }),
  settings: () => request<AiSettingsPublic>('/api/settings'),
  saveSettings: (patch: Partial<AiSettingsPublic> & { apiKey?: string }) =>
    request<AiSettingsPublic>('/api/settings', patch),
  testSettings: () => request<{ ok: boolean; reply: string }>('/api/settings/test', {}),
};
