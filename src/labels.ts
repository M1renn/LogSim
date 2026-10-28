import type { OrderStatus, TruckStatus } from '../shared/types';

export const TRUCK_STATUS: Record<TruckStatus, { label: string; tone: string }> = {
  idle: { label: 'Свободен', tone: 'ok' },
  to_pickup: { label: 'Едет на загрузку', tone: 'info' },
  loading: { label: 'Погрузка', tone: 'info' },
  in_transit: { label: 'В пути с грузом', tone: 'accent' },
  unloading: { label: 'Разгрузка', tone: 'info' },
  resting: { label: 'Отдых водителя', tone: 'warn' },
  broken: { label: 'Ремонт', tone: 'bad' },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  new: { label: 'Ждёт цену', tone: 'accent' },
  counter: { label: 'Встречное', tone: 'warn' },
  in_progress: { label: 'Выполняется', tone: 'info' },
  delivered: { label: 'Доставлен', tone: 'ok' },
  rejected: { label: 'Отказ', tone: 'muted' },
  expired: { label: 'Просрочен', tone: 'bad' },
};
