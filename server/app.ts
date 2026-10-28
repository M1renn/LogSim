// REST API игры. Один игрок — одна активная игра в памяти + автосохранение на диск.
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Difficulty, GameMode, MetaInfo, QuoteInputs } from '../shared/types';
import { CITIES, DIFFICULTY, DISTANCES, LEVELS } from './game/data';
import {
  advanceHour,
  answerCounter,
  declineOrder,
  newGame,
  skipDay,
  submitQuote,
  toPublic,
  type GameState,
} from './game/engine';
import { handleChat } from './ai/chat';
import { chatCompletion } from './ai/llm';
import { PROVIDERS, getSettings, publicSettings, updateSettings } from './ai/settings';
import { readJson, removeFile, writeJson } from './storage';

const SAVE_FILE = 'save.json';
let game: GameState | null = null;

function save() {
  if (!game) return;
  if (game.status === 'playing') writeJson(SAVE_FILE, game);
  else removeFile(SAVE_FILE);
}

function requireGame(res: Response): GameState | null {
  if (!game) {
    res.status(404).json({ error: 'Игра не начата' });
    return null;
  }
  return game;
}

const num = (v: unknown) => Number(v);

export function createApp(staticDir?: string) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/meta', (_req, res) => {
    const meta: MetaInfo = {
      cities: CITIES,
      levels: LEVELS,
      difficulties: (Object.keys(DIFFICULTY) as Difficulty[]).map((id) => ({
        id,
        label: DIFFICULTY[id].label,
        description: DIFFICULTY[id].description,
      })),
      distances: DISTANCES,
      providers: PROVIDERS,
    };
    res.json(meta);
  });

  app.get('/api/save', (_req, res) => {
    const saved = readJson<GameState>(SAVE_FILE);
    res.json({ exists: Boolean(saved && saved.status === 'playing'), title: saved?.levelTitle ?? null });
  });

  app.post('/api/game/new', (req, res) => {
    const mode: GameMode = req.body?.mode === 'free' ? 'free' : 'level';
    const diff = ['easy', 'normal', 'hard'].includes(req.body?.difficulty) ? req.body.difficulty : 'normal';
    game = newGame(mode, req.body?.levelId, diff);
    save();
    res.json({ state: toPublic(game) });
  });

  app.post('/api/game/continue', (_req, res) => {
    const saved = readJson<GameState>(SAVE_FILE);
    if (!saved) return res.status(404).json({ error: 'Сохранение не найдено' });
    game = saved;
    res.json({ state: toPublic(game) });
  });

  app.get('/api/game', (_req, res) => {
    const g = requireGame(res);
    if (g) res.json({ state: toPublic(g) });
  });

  app.post('/api/game/turn', (req, res) => {
    const g = requireGame(res);
    if (!g) return;
    const hours = Math.min(Math.max(1, Math.floor(num(req.body?.hours) || 1)), 12);
    for (let i = 0; i < hours && g.status === 'playing'; i++) advanceHour(g);
    save();
    res.json({ state: toPublic(g) });
  });

  app.post('/api/game/skip-day', (_req, res) => {
    const g = requireGame(res);
    if (!g) return;
    const report = skipDay(g);
    save();
    res.json({ state: toPublic(g), report });
  });

  app.post('/api/game/quote', (req, res) => {
    const g = requireGame(res);
    if (!g) return;
    const b = req.body ?? {};
    const raw = b.inputs ?? {};
    const inputs: QuoteInputs = {
      distanceKm: num(raw.distanceKm),
      emptyKm: num(raw.emptyKm),
      weightT: num(raw.weightT),
      fuelPrice: num(raw.fuelPrice),
      consumption: num(raw.consumption),
      driverRate: num(raw.driverRate),
      tollRate: num(raw.tollRate),
      marginPct: num(raw.marginPct),
    };
    const feedback = submitQuote(g, String(b.orderId), String(b.truckId), inputs, num(b.price));
    save();
    res.json({ state: toPublic(g), feedback });
  });

  app.post('/api/game/counter', (req, res) => {
    const g = requireGame(res);
    if (!g) return;
    const message = answerCounter(g, String(req.body?.orderId), Boolean(req.body?.accept));
    save();
    res.json({ state: toPublic(g), message });
  });

  app.post('/api/game/decline', (req, res) => {
    const g = requireGame(res);
    if (!g) return;
    declineOrder(g, String(req.body?.orderId));
    save();
    res.json({ state: toPublic(g) });
  });

  app.post('/api/game/read', (req, res) => {
    const g = requireGame(res);
    if (!g) return;
    const t = g.threads.find((x) => x.id === req.body?.threadId);
    if (t) t.unread = 0;
    res.json({ state: toPublic(g) });
  });

  app.post('/api/chat', async (req, res, next) => {
    try {
      const g = requireGame(res);
      if (!g) return;
      await handleChat(g, String(req.body?.threadId), String(req.body?.text ?? ''));
      const t = g.threads.find((x) => x.id === req.body?.threadId);
      if (t) t.unread = 0;
      save();
      res.json({ state: toPublic(g) });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/settings', (_req, res) => res.json(publicSettings()));

  app.post('/api/settings', (req, res) => res.json(updateSettings(req.body ?? {})));

  app.post('/api/settings/test', async (_req, res) => {
    const s = getSettings();
    if (s.provider === 'offline') return res.json({ ok: true, reply: 'Офлайн-бот работает без интернета.' });
    try {
      const reply = await chatCompletion(s, [
        { role: 'system', content: 'Ты проверка связи. Ответь одной короткой фразой по-русски.' },
        { role: 'user', content: 'Проверка связи. Ты меня слышишь?' },
      ]);
      res.json({ ok: true, reply });
    } catch (e) {
      res.json({ ok: false, reply: (e as Error).message });
    }
  });

  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  });

  return app;
}

/** Запускает сервер и возвращает фактический порт (0 = любой свободный) */
export function startServer(port: number, staticDir?: string): Promise<number> {
  const app = createApp(staticDir);
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
    server.on('error', reject);
  });
}
