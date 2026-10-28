// Общие формулы и константы. Одна и та же формула используется
// в калькуляторе игрока (клиент) и для эталонного расчёта (сервер).
import type { QuoteInputs } from './types';

/** Средняя скорость грузовика, км/ч */
export const AVG_SPEED = 65;
/** Погрузка и разгрузка, ч */
export const LOAD_HOURS = 2;
/** Максимум непрерывного вождения до обязательного отдыха, ч (упрощённые правила ЕС) */
export const MAX_DRIVE_HOURS = 9;
/** Сокращённый ежедневный отдых, ч */
export const REST_HOURS = 9;
/** Прирост расхода топлива на каждую тонну груза, л/100 км */
export const CONSUMPTION_PER_TON = 0.4;
/** Штраф за опоздание, доля от цены перевозки */
export const LATE_PENALTY = 0.2;

export interface CostBreakdown {
  fuelLoaded: number;
  fuelEmpty: number;
  driver: number;
  tolls: number;
  cost: number;
  price: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function calcCost(i: QuoteInputs): CostBreakdown {
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  const km = safe(i.distanceKm);
  const empty = safe(i.emptyKm);
  const loadedConsumption = safe(i.consumption) + safe(i.weightT) * CONSUMPTION_PER_TON;
  const fuelLoaded = (km * loadedConsumption) / 100 * safe(i.fuelPrice);
  const fuelEmpty = (empty * safe(i.consumption)) / 100 * safe(i.fuelPrice);
  const driver = (km + empty) * safe(i.driverRate);
  const tolls = (km + empty) * safe(i.tollRate);
  const cost = fuelLoaded + fuelEmpty + driver + tolls;
  const price = cost * (1 + safe(i.marginPct) / 100);
  return {
    fuelLoaded: r2(fuelLoaded),
    fuelEmpty: r2(fuelEmpty),
    driver: r2(driver),
    tolls: r2(tolls),
    cost: r2(cost),
    price: r2(price),
  };
}

/** Оценка времени в пути с учётом обязательного отдыха, ч */
export function estimateDriveHours(km: number): number {
  const drive = km / AVG_SPEED;
  const rests = Math.floor(drive / MAX_DRIVE_HOURS) * REST_HOURS;
  return Math.ceil(drive + rests);
}

/** Полное время выполнения заказа: порожний пробег + погрузка + рейс + разгрузка */
export function estimateOrderHours(emptyKm: number, km: number): number {
  return estimateDriveHours(emptyKm + km) + LOAD_HOURS * 2;
}

export function dayOf(hour: number): number {
  return Math.floor(hour / 24) + 1;
}

export function fmtTime(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `день ${dayOf(hour)}, ${String(h).padStart(2, '0')}:00`;
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}${Math.abs(Math.round(n)).toLocaleString('ru-RU')} €`;
}
