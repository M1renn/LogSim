// Статические данные игры: города, уровни, параметры сложности, автопарк.
import type { City, Difficulty, LevelDef, Market } from '../../shared/types';

export const CITIES: City[] = [
  { id: 'riga', name: 'Рига', country: 'LV', lat: 56.9496, lng: 24.1052 },
  { id: 'daugavpils', name: 'Даугавпилс', country: 'LV', lat: 55.8747, lng: 26.5362 },
  { id: 'liepaja', name: 'Лиепая', country: 'LV', lat: 56.5047, lng: 21.0108 },
  { id: 'ventspils', name: 'Вентспилс', country: 'LV', lat: 57.3894, lng: 21.5606 },
  { id: 'valmiera', name: 'Валмиера', country: 'LV', lat: 57.5385, lng: 25.4264 },
  { id: 'tallinn', name: 'Таллин', country: 'EE', lat: 59.437, lng: 24.7536 },
  { id: 'tartu', name: 'Тарту', country: 'EE', lat: 58.378, lng: 26.729 },
  { id: 'parnu', name: 'Пярну', country: 'EE', lat: 58.3859, lng: 24.4971 },
  { id: 'vilnius', name: 'Вильнюс', country: 'LT', lat: 54.6872, lng: 25.2797 },
  { id: 'kaunas', name: 'Каунас', country: 'LT', lat: 54.8985, lng: 23.9036 },
  { id: 'klaipeda', name: 'Клайпеда', country: 'LT', lat: 55.7033, lng: 21.1443 },
  { id: 'siauliai', name: 'Шяуляй', country: 'LT', lat: 55.9349, lng: 23.3137 },
  { id: 'warsaw', name: 'Варшава', country: 'PL', lat: 52.2297, lng: 21.0122 },
  { id: 'bialystok', name: 'Белосток', country: 'PL', lat: 53.1325, lng: 23.1688 },
];

export const CITY_MAP: Record<string, City> = Object.fromEntries(CITIES.map((c) => [c.id, c]));

/** Падежные формы для текстов персонажей: [где? (в Риге), куда? (в Ригу)] */
const CASES: Record<string, [string, string]> = {
  riga: ['Риге', 'Ригу'],
  daugavpils: ['Даугавпилсе', 'Даугавпилс'],
  liepaja: ['Лиепае', 'Лиепаю'],
  ventspils: ['Вентспилсе', 'Вентспилс'],
  valmiera: ['Валмиере', 'Валмиеру'],
  tallinn: ['Таллине', 'Таллин'],
  tartu: ['Тарту', 'Тарту'],
  parnu: ['Пярну', 'Пярну'],
  vilnius: ['Вильнюсе', 'Вильнюс'],
  kaunas: ['Каунасе', 'Каунас'],
  klaipeda: ['Клайпеде', 'Клайпеду'],
  siauliai: ['Шяуляе', 'Шяуляй'],
  warsaw: ['Варшаве', 'Варшаву'],
  bialystok: ['Белостоке', 'Белосток'],
};

/** «в Риге» — где? */
export const inCity = (id: string) => `в ${CASES[id]?.[0] ?? CITY_MAP[id]?.name ?? id}`;
/** «в Ригу» — куда? */
export const intoCity = (id: string) => `в ${CASES[id]?.[1] ?? CITY_MAP[id]?.name ?? id}`;

/** Коэффициент извилистости дорог: дорожное расстояние ≈ прямая × 1.2 */
const ROAD_FACTOR = 1.2;

function haversineKm(a: City, b: City): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Таблица дорожных расстояний между всеми городами, км */
export const DISTANCES: Record<string, Record<string, number>> = {};
for (const a of CITIES) {
  DISTANCES[a.id] = {};
  for (const b of CITIES) {
    DISTANCES[a.id][b.id] = a.id === b.id ? 0 : Math.round(haversineKm(a, b) * ROAD_FACTOR);
  }
}

export function distanceKm(fromId: string, toId: string): number {
  return DISTANCES[fromId]?.[toId] ?? 0;
}

export const START_MARKET: Market = {
  fuelPrice: 1.55,
  driverRatePerKm: 0.38,
  tollPerKm: 0.06,
};

export interface DifficultyParams {
  label: string;
  description: string;
  /** Диапазон бюджета клиента сверх себестоимости */
  budgetMin: number;
  budgetMax: number;
  /** Вероятность нового заказа в рабочий час */
  orderChance: number;
  /** Сколько часов клиент ждёт предложение */
  quoteWindow: number;
  /** Во сколько раз срок доставки больше расчётного времени рейса */
  deadlineFactor: number;
  /** Вероятность поломки за час в пути */
  breakdownChance: number;
  /** Шанс инцидента при пропуске дня */
  skipIncident: number;
  /** Шанс критического провала при пропуске дня */
  skipCritical: number;
  maxOpenOrders: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: {
    label: 'Лёгкий',
    description: 'Подсказки к расчёту, щедрые клиенты, мягкие сроки',
    budgetMin: 0.35,
    budgetMax: 0.6,
    orderChance: 0.16,
    quoteWindow: 10,
    deadlineFactor: 2.2,
    breakdownChance: 0.003,
    skipIncident: 0.25,
    skipCritical: 0.03,
    maxOpenOrders: 3,
  },
  normal: {
    label: 'Средний',
    description: 'Ошибки называются, но без правильных ответов',
    budgetMin: 0.22,
    budgetMax: 0.45,
    orderChance: 0.2,
    quoteWindow: 7,
    deadlineFactor: 1.8,
    breakdownChance: 0.006,
    skipIncident: 0.4,
    skipCritical: 0.06,
    maxOpenOrders: 4,
  },
  hard: {
    label: 'Сложный',
    description: 'Только число ошибок, жёсткие сроки, экономные клиенты',
    budgetMin: 0.15,
    budgetMax: 0.32,
    orderChance: 0.25,
    quoteWindow: 5,
    deadlineFactor: 1.5,
    breakdownChance: 0.01,
    skipIncident: 0.55,
    skipCritical: 0.1,
    maxOpenOrders: 5,
  },
};

export const LEVELS: LevelDef[] = [
  {
    id: 'l1',
    title: 'Уровень 1. Первый рейс',
    description:
      'У вас один грузовик в Риге. Найдите подходящий заказ, правильно посчитайте себестоимость и доставьте груз вовремя.',
    difficulty: 'easy',
    days: 3,
    truckCities: ['riga'],
    startMoney: 3000,
    goalDeliveries: 1,
    goalProfit: 100,
  },
  {
    id: 'l2',
    title: 'Уровень 2. Балтийский треугольник',
    description:
      'Две машины: в Риге и Вильнюсе. Учитывайте порожний пробег — выбирайте ближайший к загрузке грузовик.',
    difficulty: 'normal',
    days: 5,
    truckCities: ['riga', 'vilnius'],
    startMoney: 5000,
    goalDeliveries: 3,
    goalProfit: 450,
  },
  {
    id: 'l3',
    title: 'Уровень 3. Пиковый сезон',
    description:
      'Три машины, много заказов и жёсткие сроки. Следите за отдыхом водителей и не рискуйте пропусками дней.',
    difficulty: 'hard',
    days: 7,
    truckCities: ['riga', 'tallinn', 'kaunas'],
    startMoney: 6000,
    goalDeliveries: 6,
    goalProfit: 850,
  },
];

export const TRUCK_PRESETS = [
  { model: 'Volvo FH 460', capacityKg: 24000, baseConsumption: 24, driverName: 'Андрис' },
  { model: 'Scania R450', capacityKg: 24000, baseConsumption: 25, driverName: 'Томас' },
  { model: 'MAN TGX 18.470', capacityKg: 22000, baseConsumption: 26, driverName: 'Мартин' },
  { model: 'DAF XF 480', capacityKg: 24000, baseConsumption: 23.5, driverName: 'Юрий' },
];

/** Вымышленные компании-клиенты */
export const CLIENTS = [
  'SIA Baltic Timber',
  'UAB Amber Foods',
  'OÜ Nordic Parts',
  'SIA RigaPack',
  'UAB Vilnius Steel',
  'AS Daugava Agro',
  'SIA Kurzeme Logs',
  'OÜ Tallinn Home',
];

export const CARGOS = [
  'пиломатериалы',
  'продукты питания',
  'автозапчасти',
  'стройматериалы',
  'бытовая техника',
  'бумага в рулонах',
  'металлопрокат',
  'мебель',
];

export const SKIP_INCIDENTS = [
  { text: 'Водитель нарушил режим труда и отдыха — штраф дорожной полиции', money: -300, rep: 0 },
  { text: 'Груз повреждён при погрузке без контроля — компенсация клиенту', money: -450, rep: -5 },
  { text: 'Пропущен звонок важного клиента — он недоволен', money: 0, rep: -6 },
  { text: 'Водитель заправился на дорогой АЗС у трассы', money: -180, rep: 0 },
  { text: 'Машина простояла без документов — счёт за простой', money: -250, rep: -2 },
];

export const SKIP_CRITICAL = [
  'водитель уснул за рулём, произошло ДТП, груз уничтожен',
  'груз украли с неохраняемой стоянки',
  'ключевой клиент расторг контракт: целый день никто не выходил на связь',
];
