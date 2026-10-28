// Общие типы для сервера (игровой движок) и клиента (React-интерфейс).

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameMode = 'level' | 'free';

export interface City {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export interface LevelDef {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  days: number;
  truckCities: string[];
  startMoney: number;
  goalDeliveries: number;
  goalProfit: number;
}

export type TruckStatus =
  | 'idle'
  | 'to_pickup'
  | 'loading'
  | 'in_transit'
  | 'unloading'
  | 'resting'
  | 'broken';

export interface Leg {
  fromId: string;
  toId: string;
  totalKm: number;
  doneKm: number;
}

export interface Truck {
  id: string;
  number: number;
  model: string;
  driverName: string;
  capacityKg: number;
  /** Базовый расход без груза, л/100 км */
  baseConsumption: number;
  cityId: string;
  lat: number;
  lng: number;
  status: TruckStatus;
  orderId: string | null;
  leg: Leg | null;
  /** Часы непрерывного вождения (для режима труда и отдыха) */
  drivingHours: number;
  /** Сколько часов осталось до конца погрузки/разгрузки/отдыха/ремонта */
  timer: number;
  /** В какой статус вернуться после отдыха или ремонта */
  resumeStatus: TruckStatus | null;
}

export type OrderStatus =
  | 'new'
  | 'counter'
  | 'in_progress'
  | 'delivered'
  | 'rejected'
  | 'expired';

export interface OrderResult {
  revenue: number;
  cost: number;
  penalty: number;
  profit: number;
  late: boolean;
}

export interface Order {
  id: string;
  client: string;
  cargo: string;
  fromId: string;
  toId: string;
  weightKg: number;
  distanceKm: number;
  createdHour: number;
  quoteBy: number;
  deadlineHour: number;
  status: OrderStatus;
  truckId: string | null;
  price: number | null;
  counterPrice: number | null;
  costEstimate: number | null;
  deliveredHour: number | null;
  result: OrderResult | null;
}

export interface Market {
  /** Цена дизеля, €/л */
  fuelPrice: number;
  /** Оплата водителя, €/км */
  driverRatePerKm: number;
  /** Дорожные сборы, €/км */
  tollPerKm: number;
}

export type Sender = 'player' | 'npc' | 'system';

export interface ChatMessage {
  id: string;
  threadId: string;
  from: Sender;
  author: string;
  text: string;
  hour: number;
}

export type ThreadRole = 'client' | 'driver' | 'mentor';

export interface ChatThread {
  id: string;
  title: string;
  role: ThreadRole;
  truckId?: string;
  unread: number;
}

export type LogKind = 'info' | 'good' | 'bad' | 'warn';

export interface LogEntry {
  hour: number;
  text: string;
  kind: LogKind;
}

export interface Stats {
  deliveries: number;
  onTime: number;
  late: number;
  revenue: number;
  costs: number;
  quotes: number;
  accurateQuotes: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface PublicGameState {
  id: string;
  mode: GameMode;
  levelId: string | null;
  levelTitle: string;
  difficulty: Difficulty;
  /** Абсолютный игровой час с начала игры (день 1, 00:00 = 0) */
  hour: number;
  endHour: number | null;
  money: number;
  startMoney: number;
  reputation: number;
  goalDeliveries: number | null;
  goalProfit: number | null;
  trucks: Truck[];
  orders: Order[];
  market: Market;
  threads: ChatThread[];
  messages: ChatMessage[];
  log: LogEntry[];
  stats: Stats;
  status: GameStatus;
  endReason: string | null;
}

/** Данные, которые игрок вводит в форму расчёта */
export interface QuoteInputs {
  distanceKm: number;
  emptyKm: number;
  weightT: number;
  fuelPrice: number;
  consumption: number;
  driverRate: number;
  tollRate: number;
  marginPct: number;
}

export type ClientDecision = 'accepted' | 'counter' | 'rejected' | 'invalid';

export interface QuoteFeedback {
  decision: ClientDecision;
  message: string;
  errors: string[];
  tips: string[];
  playerCost: number;
  /** Реальная себестоимость показывается только на лёгком уровне */
  trueCost: number | null;
  etaHours: number;
}

export interface SkipReport {
  hours: number;
  incidents: string[];
  critical: boolean;
}

export type AiProvider = 'offline' | 'gemini' | 'groq' | 'openrouter' | 'ollama' | 'custom';

export interface AiSettingsPublic {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  hasKey: boolean;
}

export interface MetaInfo {
  cities: City[];
  levels: LevelDef[];
  difficulties: { id: Difficulty; label: string; description: string }[];
  distances: Record<string, Record<string, number>>;
  providers: { id: AiProvider; label: string; baseUrl: string; model: string; needsKey: boolean }[];
}
