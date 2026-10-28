// Игровой движок: состояние, пошаговая симуляция, заказы, расчёт предложений.
// Все игровые решения (принял ли клиент цену, штрафы, поломки) принимает движок,
// а не ИИ — ИИ только озвучивает персонажей. Это и есть главный «ограничитель».
import { randomUUID } from 'node:crypto';
import type {
  ChatThread,
  Difficulty,
  GameMode,
  LogKind,
  Order,
  PublicGameState,
  QuoteFeedback,
  QuoteInputs,
  Sender,
  SkipReport,
  Truck,
} from '../../shared/types';
import {
  AVG_SPEED,
  LATE_PENALTY,
  LOAD_HOURS,
  MAX_DRIVE_HOURS,
  REST_HOURS,
  calcCost,
  estimateOrderHours,
  fmtMoney,
  fmtTime,
} from '../../shared/game';
import {
  CARGOS,
  CITIES,
  CITY_MAP,
  CLIENTS,
  DIFFICULTY,
  LEVELS,
  SKIP_CRITICAL,
  SKIP_INCIDENTS,
  START_MARKET,
  TRUCK_PRESETS,
  distanceKm,
  inCity,
  intoCity,
} from './data';

export interface ServerOrder extends Order {
  /** Скрытый максимальный бюджет клиента — игроку не отправляется */
  budget: number;
  attempts: number;
}

export interface GameState extends Omit<PublicGameState, 'orders'> {
  orders: ServerOrder[];
  seq: number;
}

const MAX_MESSAGES = 500;
const MAX_LOG = 300;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const cityName = (id: string) => CITY_MAP[id]?.name ?? id;

// ---------- вспомогательные функции состояния ----------

export function say(s: GameState, threadId: string, from: Sender, author: string, text: string) {
  s.messages.push({ id: randomUUID(), threadId, from, author, text, hour: s.hour });
  if (s.messages.length > MAX_MESSAGES) s.messages.splice(0, s.messages.length - MAX_MESSAGES);
  if (from !== 'player') {
    const t = s.threads.find((x) => x.id === threadId);
    if (t) t.unread++;
  }
}

export function log(s: GameState, text: string, kind: LogKind = 'info') {
  s.log.push({ hour: s.hour, text, kind });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

export const driverThreadId = (truckId: string) => `driver:${truckId}`;

function driverSay(s: GameState, t: Truck, text: string) {
  say(s, driverThreadId(t.id), 'npc', t.driverName, text);
}

function mentorSay(s: GameState, text: string) {
  say(s, 'mentor', 'npc', 'Ирина (наставник)', text);
}

function changeRep(s: GameState, delta: number) {
  s.reputation = clamp(s.reputation + delta, 0, 100);
}

export function profitOf(s: { money: number; startMoney: number }) {
  return s.money - s.startMoney;
}

// ---------- создание новой игры ----------

export function newGame(mode: GameMode, levelId?: string | null, difficulty?: Difficulty): GameState {
  const level = mode === 'level' ? LEVELS.find((l) => l.id === levelId) ?? LEVELS[0] : null;
  const diff: Difficulty = level?.difficulty ?? difficulty ?? 'normal';
  const truckCities = level?.truckCities ?? ['riga', 'vilnius'];
  const startMoney = level?.startMoney ?? 8000;
  const startHour = 8; // день 1, 08:00

  const s: GameState = {
    id: randomUUID(),
    mode,
    levelId: level?.id ?? null,
    levelTitle: level?.title ?? `Свободная игра (${DIFFICULTY[diff].label.toLowerCase()})`,
    difficulty: diff,
    hour: startHour,
    endHour: level ? startHour + level.days * 24 : null,
    money: startMoney,
    startMoney,
    reputation: 60,
    goalDeliveries: level?.goalDeliveries ?? null,
    goalProfit: level?.goalProfit ?? null,
    trucks: [],
    orders: [],
    market: { ...START_MARKET },
    threads: [],
    messages: [],
    log: [],
    stats: { deliveries: 0, onTime: 0, late: 0, revenue: 0, costs: 0, quotes: 0, accurateQuotes: 0 },
    status: 'playing',
    endReason: null,
    seq: 100,
  };

  s.threads.push({ id: 'mentor', title: 'Наставник', role: 'mentor', unread: 0 });
  s.threads.push({ id: 'clients', title: 'Клиенты', role: 'client', unread: 0 });

  truckCities.forEach((cityId, i) => {
    const p = TRUCK_PRESETS[i % TRUCK_PRESETS.length];
    const c = CITY_MAP[cityId];
    const truck: Truck = {
      id: `T${i + 1}`,
      number: i + 1,
      model: p.model,
      driverName: p.driverName,
      capacityKg: p.capacityKg,
      baseConsumption: p.baseConsumption,
      cityId,
      lat: c.lat,
      lng: c.lng,
      status: 'idle',
      orderId: null,
      leg: null,
      drivingHours: 0,
      timer: 0,
      resumeStatus: null,
    };
    s.trucks.push(truck);
    const thread: ChatThread = {
      id: driverThreadId(truck.id),
      title: `${truck.driverName} (#${truck.number})`,
      role: 'driver',
      truckId: truck.id,
      unread: 0,
    };
    s.threads.push(thread);
    driverSay(s, truck, `На связи! Стою ${inCity(cityId)} на ${truck.model}, готов к рейсу.`);
  });

  const intro = level
    ? `${level.description}\n\nЦель: ${level.goalDeliveries} доставк(и) и прибыль от ${fmtMoney(level.goalProfit)} за ${level.days} дн.`
    : 'Свободная игра: развивайте компанию как можно дольше. Игра закончится при банкротстве или потере репутации.';
  mentorSay(
    s,
    `Привет! Я Ирина, буду помогать тебе на старте.\n\n${intro}\n\n` +
      'Как работать: выбери заказ во вкладке «Заказы», выбери грузовик, заполни форму расчёта под картой ' +
      '(расстояние, порожний пробег, вес, топливо, ставки) и отправь клиенту цену. ' +
      'Один ход = 1 игровой час. Можно пропустить сразу день, но без контроля что-то может пойти не так.',
  );
  log(s, `Начало игры: ${s.levelTitle}`);

  spawnOrder(s);
  spawnOrder(s);
  return s;
}

// ---------- заказы ----------

/** Эталонные входные данные для расчёта (то, что игрок должен был ввести) */
export function trueInputs(s: GameState, o: Order, truck: Truck, marginPct = 0): QuoteInputs {
  return {
    distanceKm: o.distanceKm,
    emptyKm: distanceKm(truck.cityId, o.fromId),
    weightT: o.weightKg / 1000,
    fuelPrice: s.market.fuelPrice,
    consumption: truck.baseConsumption,
    driverRate: s.market.driverRatePerKm,
    tollRate: s.market.tollPerKm,
    marginPct,
  };
}

export function spawnOrder(s: GameState): ServerOrder {
  const d = DIFFICULTY[s.difficulty];
  // чаще заказы начинаются там, где есть машины — так игроку проще на старте
  const truckCityIds = s.trucks.map((t) => t.cityId);
  const from =
    Math.random() < 0.5 && truckCityIds.length ? CITY_MAP[pick(truckCityIds)] : pick(CITIES);
  let to = pick(CITIES);
  while (to.id === from.id) to = pick(CITIES);

  const dist = distanceKm(from.id, to.id);
  const maxCapT = Math.max(...s.trucks.map((t) => t.capacityKg)) / 1000;
  const weightKg = Math.round(rnd(2, maxCapT * 0.95) * 10) * 100;

  // бюджет считается от лучшего возможного грузовика (ближайшего к загрузке)
  const best = [...s.trucks].sort(
    (a, b) => distanceKm(a.cityId, from.id) - distanceKm(b.cityId, from.id),
  )[0];
  const draft: Order = {
    id: `Z-${++s.seq}`,
    client: pick(CLIENTS),
    cargo: pick(CARGOS),
    fromId: from.id,
    toId: to.id,
    weightKg,
    distanceKm: dist,
    createdHour: s.hour,
    quoteBy: s.hour + d.quoteWindow,
    deadlineHour: 0,
    status: 'new',
    truckId: null,
    price: null,
    counterPrice: null,
    costEstimate: null,
    deliveredHour: null,
    result: null,
  };
  const ref = calcCost(trueInputs(s, draft, best));
  const tripHours = estimateOrderHours(distanceKm(best.cityId, from.id), dist);
  draft.deadlineHour = s.hour + Math.ceil(tripHours * d.deadlineFactor) + 10;
  const order: ServerOrder = {
    ...draft,
    budget: Math.round(ref.cost * (1 + rnd(d.budgetMin, d.budgetMax))),
    attempts: 0,
  };
  s.orders.push(order);

  say(
    s,
    'clients',
    'npc',
    order.client,
    `Здравствуйте! Заказ ${order.id}: нужно перевезти ${order.cargo}, ${(weightKg / 1000).toFixed(1)} т, ` +
      `${from.name} → ${to.name}. Доставка до ${fmtTime(order.deadlineHour)}. ` +
      `Жду ваше предложение до ${fmtTime(order.quoteBy)}.`,
  );
  log(s, `Новый заказ ${order.id}: ${from.name} → ${to.name}, ${(weightKg / 1000).toFixed(1)} т`);
  return order;
}

interface QuoteCheck {
  key: keyof QuoteInputs;
  label: string;
  tol: (truth: number) => number;
  unit: string;
}

const CHECKS: QuoteCheck[] = [
  { key: 'distanceKm', label: 'Расстояние с грузом', tol: (t) => Math.max(3, t * 0.03), unit: 'км' },
  { key: 'emptyKm', label: 'Порожний пробег', tol: (t) => Math.max(5, t * 0.05), unit: 'км' },
  { key: 'weightT', label: 'Вес груза', tol: () => 0.05, unit: 'т' },
  { key: 'fuelPrice', label: 'Цена топлива', tol: () => 0.011, unit: '€/л' },
  { key: 'consumption', label: 'Базовый расход', tol: () => 0.11, unit: 'л/100 км' },
  { key: 'driverRate', label: 'Ставка водителя', tol: () => 0.006, unit: '€/км' },
  { key: 'tollRate', label: 'Дорожные сборы', tol: () => 0.006, unit: '€/км' },
];

export function submitQuote(
  s: GameState,
  orderId: string,
  truckId: string,
  inputs: QuoteInputs,
  price: number,
): QuoteFeedback {
  const invalid = (message: string): QuoteFeedback => ({
    decision: 'invalid',
    message,
    errors: [],
    tips: [],
    playerCost: 0,
    trueCost: null,
    etaHours: 0,
  });
  if (s.status !== 'playing') return invalid('Игра уже закончена.');
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'new') return invalid('Этот заказ уже недоступен для предложения.');
  const truck = s.trucks.find((t) => t.id === truckId);
  if (!truck) return invalid('Выберите грузовик.');
  if (truck.orderId || truck.status !== 'idle')
    return invalid(`Грузовик #${truck.number} занят. Выберите свободную машину.`);
  if (truck.capacityKg < o.weightKg)
    return invalid(
      `Грузовик #${truck.number} не увезёт ${(o.weightKg / 1000).toFixed(1)} т (максимум ${truck.capacityKg / 1000} т).`,
    );
  if (!Number.isFinite(price) || price <= 0) return invalid('Укажите цену для клиента больше нуля.');

  const truth = trueInputs(s, o, truck, inputs.marginPct);
  const trueCost = calcCost(truth).cost;
  const playerCost = calcCost(inputs).cost;

  const wrong: QuoteCheck[] = CHECKS.filter(
    (c) => Math.abs((Number(inputs[c.key]) || 0) - truth[c.key]) > c.tol(truth[c.key]),
  );
  let errors: string[] = [];
  if (s.difficulty === 'easy') {
    errors = wrong.map(
      (c) => `${c.label}: введено ${inputs[c.key]}, правильно ${r2(truth[c.key])} ${c.unit}`,
    );
  } else if (s.difficulty === 'normal') {
    errors = wrong.map((c) => `${c.label}: значение неверное`);
  } else if (wrong.length) {
    errors = [`В расчёте ошибок: ${wrong.length}. Перепроверьте исходные данные.`];
  }

  s.stats.quotes++;
  if (wrong.length === 0) {
    s.stats.accurateQuotes++;
    changeRep(s, 1);
  }

  const emptyKm = truth.emptyKm;
  const etaHours = estimateOrderHours(emptyKm, o.distanceKm);
  const tips: string[] = [];
  if (price < trueCost) tips.push('Цена ниже реальной себестоимости — рейс будет убыточным.');
  if (s.hour + etaHours > o.deadlineHour)
    tips.push(
      `По оценке рейс займёт ~${etaHours} ч, вы рискуете опоздать (срок ${fmtTime(o.deadlineHour)}). Штраф за опоздание ${LATE_PENALTY * 100}%.`,
    );
  if (emptyKm > 250) tips.push(`Большой порожний пробег (${emptyKm} км) съедает прибыль — проверьте другие машины.`);

  o.attempts++;
  let decision: QuoteFeedback['decision'];
  let message: string;
  if (price <= o.budget) {
    decision = 'accepted';
    message = `Договорились! ${fmtMoney(price)} нас устраивает. Ждём машину #${truck.number}.`;
    assignOrder(s, o, truck, price);
  } else if (price <= o.budget * 1.15 && o.attempts <= 2) {
    decision = 'counter';
    o.status = 'counter';
    o.truckId = truck.id;
    o.counterPrice = Math.floor(o.budget / 10) * 10;
    message = `Дороговато. Можем предложить ${fmtMoney(o.counterPrice)} — согласны?`;
  } else if (o.attempts >= 2) {
    decision = 'rejected';
    o.status = 'rejected';
    changeRep(s, -2);
    message = 'Слишком дорого, мы нашли другого перевозчика. Спасибо.';
    log(s, `${o.id}: клиент отказался от предложения`, 'warn');
  } else {
    decision = 'rejected';
    message = `${fmtMoney(price)} — это слишком дорого для нас. Пересчитайте, пожалуйста.`;
  }

  say(s, 'clients', 'player', 'Вы', `Предложение по ${o.id}: ${fmtMoney(price)}, машина #${truck.number}.`);
  say(s, 'clients', 'npc', o.client, message);

  if (wrong.length) {
    const head = s.difficulty === 'hard' ? 'В расчёте есть ошибки.' : 'Я проверила твой расчёт:';
    mentorSay(s, `${head}\n• ${errors.join('\n• ')}\nПодсказка: все ставки есть во вкладке «Рынок», расстояния — в справочнике.`);
  }

  return {
    decision,
    message,
    errors,
    tips,
    playerCost,
    trueCost: s.difficulty === 'easy' ? trueCost : null,
    etaHours,
  };
}

function assignOrder(s: GameState, o: ServerOrder, truck: Truck, price: number) {
  o.status = 'in_progress';
  o.truckId = truck.id;
  o.price = price;
  o.counterPrice = null;
  o.costEstimate = calcCost(trueInputs(s, o, truck)).cost;
  truck.orderId = o.id;
  if (truck.cityId === o.fromId) {
    truck.status = 'loading';
    truck.timer = LOAD_HOURS;
    driverSay(s, truck, `Принял ${o.id}. Я уже ${inCity(o.fromId)}, встаю под погрузку.`);
  } else {
    truck.status = 'to_pickup';
    truck.leg = {
      fromId: truck.cityId,
      toId: o.fromId,
      totalKm: distanceKm(truck.cityId, o.fromId),
      doneKm: 0,
    };
    driverSay(
      s,
      truck,
      `Принял ${o.id}. Еду на загрузку ${intoCity(o.fromId)}, это ${truck.leg.totalKm} км порожняком.`,
    );
  }
  log(s, `${o.id} принят за ${fmtMoney(price)}, машина #${truck.number}`, 'good');
}

export function answerCounter(s: GameState, orderId: string, accept: boolean): string {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'counter' || o.counterPrice == null) return 'Встречное предложение уже неактуально.';
  if (!accept) {
    o.status = 'rejected';
    say(s, 'clients', 'player', 'Вы', `По ${o.id}: к сожалению, за ${fmtMoney(o.counterPrice)} не можем.`);
    say(s, 'clients', 'npc', o.client, 'Понятно, жаль. Обратимся в следующий раз.');
    log(s, `${o.id}: встречное предложение отклонено`);
    return 'Вы отказались от встречного предложения.';
  }
  const truck = s.trucks.find((t) => t.id === o.truckId);
  if (!truck || truck.orderId || truck.status !== 'idle') {
    o.status = 'new';
    o.truckId = null;
    o.counterPrice = null;
    return 'Выбранный грузовик уже занят — отправьте предложение заново с другой машиной.';
  }
  say(s, 'clients', 'player', 'Вы', `По ${o.id}: согласны на ${fmtMoney(o.counterPrice)}.`);
  say(s, 'clients', 'npc', o.client, 'Отлично, ждём машину!');
  assignOrder(s, o, truck, o.counterPrice);
  return 'Заказ принят.';
}

export function declineOrder(s: GameState, orderId: string) {
  const o = s.orders.find((x) => x.id === orderId);
  if (!o || (o.status !== 'new' && o.status !== 'counter')) return;
  o.status = 'rejected';
  say(s, 'clients', 'player', 'Вы', `По ${o.id}: к сожалению, сейчас не сможем взять этот груз.`);
  say(s, 'clients', 'npc', o.client, 'Спасибо, что ответили честно.');
  log(s, `${o.id}: вы отказались от заказа`);
}

// ---------- пошаговая симуляция ----------

function stepTruck(s: GameState, t: Truck) {
  const d = DIFFICULTY[s.difficulty];
  const order = t.orderId ? s.orders.find((o) => o.id === t.orderId) : undefined;

  switch (t.status) {
    case 'idle':
      t.drivingHours = Math.max(0, t.drivingHours - 1.5);
      return;
    case 'resting':
    case 'broken': {
      t.timer--;
      if (t.timer <= 0) {
        const was = t.status;
        t.status = t.resumeStatus ?? 'idle';
        t.resumeStatus = null;
        if (was === 'resting') t.drivingHours = 0;
        driverSay(s, t, was === 'resting' ? 'Отдохнул, продолжаю движение.' : 'Ремонт закончили, еду дальше.');
      }
      return;
    }
    case 'loading': {
      t.timer--;
      if (t.timer <= 0 && order) {
        t.status = 'in_transit';
        t.leg = { fromId: order.fromId, toId: order.toId, totalKm: order.distanceKm, doneKm: 0 };
        driverSay(s, t, `Загрузился (${order.cargo}), выезжаю ${intoCity(order.toId)}. ${order.distanceKm} км.`);
        log(s, `${order.id}: машина #${t.number} загружена и в пути`);
      }
      return;
    }
    case 'unloading': {
      t.timer--;
      if (t.timer <= 0) deliver(s, t);
      return;
    }
    case 'to_pickup':
    case 'in_transit': {
      if (!t.leg) {
        t.status = 'idle';
        return;
      }
      if (Math.random() < d.breakdownChance) {
        const cost = Math.round(rnd(150, 600));
        s.money -= cost;
        s.stats.costs += cost;
        t.resumeStatus = t.status;
        t.status = 'broken';
        t.timer = Math.round(rnd(3, 8));
        driverSay(s, t, `Поломка! Встал на трассе. Ремонт примерно ${t.timer} ч, стоимость ${fmtMoney(cost)}.`);
        log(s, `Поломка машины #${t.number}: −${fmtMoney(cost)}, простой ${t.timer} ч`, 'bad');
        return;
      }
      let speed = AVG_SPEED * rnd(0.85, 1.1);
      if (Math.random() < 0.04) {
        speed *= 0.4;
        driverSay(s, t, 'Стою в пробке, ремонт дороги. Немного задержусь.');
      }
      t.leg.doneKm = Math.min(t.leg.totalKm, t.leg.doneKm + speed);
      t.drivingHours++;
      const a = CITY_MAP[t.leg.fromId];
      const b = CITY_MAP[t.leg.toId];
      const k = t.leg.totalKm ? t.leg.doneKm / t.leg.totalKm : 1;
      t.lat = a.lat + (b.lat - a.lat) * k;
      t.lng = a.lng + (b.lng - a.lng) * k;

      if (t.leg.doneKm >= t.leg.totalKm) {
        const wasPickup = t.status === 'to_pickup';
        t.cityId = t.leg.toId;
        t.lat = b.lat;
        t.lng = b.lng;
        t.leg = null;
        t.status = wasPickup ? 'loading' : 'unloading';
        t.timer = LOAD_HOURS;
        driverSay(s, t, wasPickup ? `Я на месте загрузки ${inCity(b.id)}.` : `Прибыл ${intoCity(b.id)}, разгружаюсь.`);
      } else if (t.drivingHours >= MAX_DRIVE_HOURS) {
        t.resumeStatus = t.status;
        t.status = 'resting';
        t.timer = REST_HOURS;
        driverSay(
          s,
          t,
          `По тахографу отъездил ${MAX_DRIVE_HOURS} ч — обязательный отдых ${REST_HOURS} ч. Осталось ${Math.round(t.leg.totalKm - t.leg.doneKm)} км.`,
        );
        log(s, `Машина #${t.number}: обязательный отдых водителя`);
      }
      return;
    }
  }
}

function deliver(s: GameState, t: Truck) {
  const o = s.orders.find((x) => x.id === t.orderId);
  t.status = 'idle';
  t.orderId = null;
  t.timer = 0;
  if (!o || o.price == null) return;

  const late = s.hour > o.deadlineHour;
  const revenue = o.price;
  const cost = o.costEstimate ?? 0;
  const penalty = late ? Math.round(revenue * LATE_PENALTY) : 0;
  const profit = r2(revenue - cost - penalty);

  s.money = r2(s.money + revenue - cost - penalty);
  s.stats.deliveries++;
  s.stats.revenue += revenue;
  s.stats.costs += cost + penalty;
  if (late) s.stats.late++;
  else s.stats.onTime++;
  changeRep(s, late ? -8 : 3);

  o.status = 'delivered';
  o.deliveredHour = s.hour;
  o.result = { revenue, cost, penalty, profit, late };

  say(
    s,
    'clients',
    'npc',
    o.client,
    late
      ? `Груз по ${o.id} пришёл с опозданием на ${s.hour - o.deadlineHour} ч. Удерживаем штраф ${fmtMoney(penalty)}.`
      : `Груз по ${o.id} получили вовремя, спасибо! Оплату ${fmtMoney(revenue)} отправили.`,
  );
  driverSay(s, t, `Разгрузился ${inCity(t.cityId)}. Свободен, жду новый заказ.`);
  log(
    s,
    `${o.id} доставлен${late ? ' с опозданием' : ''}: выручка ${fmtMoney(revenue)}, затраты ${fmtMoney(cost + penalty)}, прибыль ${fmtMoney(profit)}`,
    late || profit < 0 ? 'bad' : 'good',
  );
}

function checkEnd(s: GameState) {
  if (s.status !== 'playing') return;
  if (s.money < 0) {
    s.status = 'lost';
    s.endReason = 'Банкротство: на счёте компании не осталось денег.';
  } else if (s.reputation <= 0) {
    s.status = 'lost';
    s.endReason = 'Репутация упала до нуля — клиенты отказались с вами работать.';
  } else if (s.mode === 'level' && s.goalDeliveries != null && s.goalProfit != null) {
    if (s.stats.deliveries >= s.goalDeliveries && profitOf(s) >= s.goalProfit) {
      s.status = 'won';
      s.endReason = `Цель уровня выполнена: ${s.stats.deliveries} доставк(и), прибыль ${fmtMoney(profitOf(s))}.`;
    } else if (s.endHour != null && s.hour >= s.endHour) {
      s.status = 'lost';
      s.endReason = 'Время уровня вышло, а цель не выполнена.';
    }
  }
  if (s.status !== 'playing') log(s, s.endReason ?? '', s.status === 'won' ? 'good' : 'bad');
}

/** Один ход = один игровой час */
export function advanceHour(s: GameState) {
  if (s.status !== 'playing') return;
  s.hour++;
  const d = DIFFICULTY[s.difficulty];

  for (const t of s.trucks) stepTruck(s, t);

  for (const o of s.orders) {
    if ((o.status === 'new' || o.status === 'counter') && s.hour > o.quoteBy) {
      o.status = 'expired';
      changeRep(s, -3);
      say(s, 'clients', 'npc', o.client, `Мы не дождались ответа по ${o.id} и нашли другого перевозчика.`);
      log(s, `${o.id} просрочен: клиент ушёл без ответа (−3 репутации)`, 'warn');
    }
  }

  const hod = s.hour % 24;
  const open = s.orders.filter((o) => o.status === 'new' || o.status === 'counter').length;
  if (hod >= 6 && hod <= 20 && open < d.maxOpenOrders && Math.random() < d.orderChance) spawnOrder(s);
  else if (open === 0 && hod >= 8 && hod <= 18 && Math.random() < 0.5) spawnOrder(s);

  if (hod === 0) {
    const old = s.market.fuelPrice;
    s.market.fuelPrice = Math.round(clamp(old * (1 + rnd(-0.04, 0.04)), 1.3, 1.95) * 1000) / 1000;
    log(s, `Новый день. Цена топлива: ${old.toFixed(3)} → ${s.market.fuelPrice.toFixed(3)} €/л`);
  }

  checkEnd(s);
}

/** Пропуск суток: быстро, но с риском инцидентов и даже провала уровня */
export function skipDay(s: GameState): SkipReport {
  const report: SkipReport = { hours: 0, incidents: [], critical: false };
  if (s.status !== 'playing') return report;
  const d = DIFFICULTY[s.difficulty];
  const active = s.orders.filter((o) => o.status === 'in_progress').length;

  if (Math.random() < d.skipCritical + active * 0.03) {
    report.critical = true;
    const what = pick(SKIP_CRITICAL);
    if (s.mode === 'level') {
      s.status = 'lost';
      s.endReason = `Критический инцидент во время пропуска дня: ${what}. Уровень провален.`;
      report.incidents.push(`Критический инцидент: ${what}`);
      log(s, s.endReason, 'bad');
      return report;
    }
    s.money -= 2500;
    changeRep(s, -30);
    report.incidents.push(`Критический инцидент: ${what} (−2 500 €, −30 репутации)`);
    log(s, `Критический инцидент: ${what}`, 'bad');
  } else {
    let chance = d.skipIncident + active * 0.05;
    while (Math.random() < chance && report.incidents.length < 2) {
      const inc = pick(SKIP_INCIDENTS);
      s.money += inc.money;
      if (inc.money < 0) s.stats.costs -= inc.money;
      changeRep(s, inc.rep);
      const parts = [inc.money ? fmtMoney(inc.money) : '', inc.rep ? `${inc.rep} репутации` : '']
        .filter(Boolean)
        .join(', ');
      report.incidents.push(`${inc.text}${parts ? ` (${parts})` : ''}`);
      log(s, `Пока вас не было: ${inc.text}`, 'bad');
      chance /= 2;
    }
  }

  for (let i = 0; i < 24 && s.status === 'playing'; i++) {
    advanceHour(s);
    report.hours++;
  }
  checkEnd(s);
  return report;
}

// ---------- сериализация ----------

export function toPublic(s: GameState): PublicGameState {
  const { seq: _seq, orders, ...rest } = s;
  return {
    ...rest,
    orders: orders.map(({ budget: _b, attempts: _a, ...o }) => o),
  };
}
