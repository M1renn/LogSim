// Офлайн-бот на правилах: работает без интернета и ключей.
// Используется по умолчанию и как запасной вариант, если ИИ-провайдер недоступен.
import type { ChatThread } from '../../shared/types';
import { CONSUMPTION_PER_TON, MAX_DRIVE_HOURS, REST_HOURS, fmtTime } from '../../shared/game';
import { CITY_MAP, distanceKm, inCity, intoCity } from '../game/data';
import type { GameState } from '../game/engine';
import { STATUS_RU } from './persona';

const cityName = (id: string) => CITY_MAP[id]?.name ?? id;
const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

function findCity(text: string): string | null {
  for (const c of Object.values(CITY_MAP)) {
    const stem = c.name.toLowerCase().slice(0, Math.max(4, c.name.length - 2));
    if (text.includes(stem)) return c.id;
  }
  return null;
}

export function offlineReply(s: GameState, thread: ChatThread, raw: string): string {
  const text = raw.toLowerCase();

  if (thread.role === 'driver') {
    const t = s.trucks.find((x) => x.id === thread.truckId)!;
    const order = t.orderId ? s.orders.find((o) => o.id === t.orderId) : undefined;
    const city = findCity(text);
    if (city && has(text, 'сколько', 'км', 'расстоян', 'далеко'))
      return `${cityName(t.cityId)} → ${cityName(city)}: примерно ${distanceKm(t.cityId, city)} км по дороге.`;
    if (has(text, 'где', 'место', 'находишь'))
      return t.leg
        ? `Еду ${cityName(t.leg.fromId)} → ${cityName(t.leg.toId)}, осталось ${Math.round(t.leg.totalKm - t.leg.doneKm)} км.`
        : `Стою ${inCity(t.cityId)}. Сейчас: ${STATUS_RU[t.status]}.`;
    if (has(text, 'когда', 'приед', 'успе', 'срок', 'eta'))
      return t.leg
        ? `Если без пробок — часов ${Math.ceil((t.leg.totalKm - t.leg.doneKm) / 65)} езды. Но помни про отдых по тахографу.`
        : order
          ? `Срок по ${order.id} — ${fmtTime(order.deadlineHour)}. Сейчас ${STATUS_RU[t.status]}.`
          : 'Я пока без заказа, могу выехать сразу.';
    if (has(text, 'расход', 'топлив', 'солярк', 'дизел'))
      return `Пустой ${t.model} берёт около ${t.baseConsumption} л на сотню, плюс примерно ${CONSUMPTION_PER_TON} л за каждую тонну груза.`;
    if (has(text, 'отдых', 'устал', 'тахограф', 'спать'))
      return `За рулём уже ${t.drivingHours.toFixed(0)} ч. После ${MAX_DRIVE_HOURS} ч обязан встать на ${REST_HOURS} ч, иначе штраф.`;
    if (has(text, 'груз', 'вес', 'тонн', 'заказ'))
      return order
        ? `Везу ${order.cargo}, ${(order.weightKg / 1000).toFixed(1)} т по заказу ${order.id}.`
        : `Машина пустая, берём до ${t.capacityKg / 1000} т.`;
    if (has(text, 'привет', 'здрав', 'добр'))
      return `Привет, диспетчер! ${t.leg ? 'Я в пути.' : `Стою ${inCity(t.cityId)}.`}`;
    return `Понял. Сейчас у меня: ${STATUS_RU[t.status]}, ${t.leg ? `еду ${intoCity(t.leg.toId)}` : inCity(t.cityId)}.`;
  }

  if (thread.role === 'client') {
    const open = s.orders.filter((o) => ['new', 'counter', 'in_progress'].includes(o.status));
    const idMatch = raw.match(/z-?\s?(\d+)/i);
    const order =
      (idMatch && open.find((o) => o.id.endsWith(idMatch[1]))) || open[open.length - 1] || undefined;
    if (!order) return 'Сейчас у нас нет открытых заявок. Напишем, когда появится груз.';
    const who = order.client;
    if (has(text, 'скидк', 'дорог', 'дешев', 'цен', 'бюджет'))
      return `${who}: цена важна, но надёжность ещё важнее. Пришлите расчёт через форму — рассмотрим.`;
    if (has(text, 'срок', 'когда', 'успе', 'дедлайн'))
      return `${who}: по ${order.id} груз нужен до ${fmtTime(order.deadlineHour)}. Опоздание — штраф по договору.`;
    if (has(text, 'вес', 'груз', 'что везти', 'упаков'))
      return `${who}: ${order.cargo}, ${(order.weightKg / 1000).toFixed(1)} т, загрузка ${inCity(order.fromId)}, выгрузка ${inCity(order.toId)}.`;
    if (has(text, 'привет', 'здрав', 'добр'))
      return `${who}: добрый день! Ждём ваше предложение по ${order.id}.`;
    return `${who}: принято. Официальное предложение по ${order.id} отправьте через форму расчёта.`;
  }

  // наставник
  if (has(text, 'порожн', 'пуст'))
    return 'Порожний пробег — это путь машины от текущего города до места загрузки. Его тоже оплачиваешь ты: топливо по базовому расходу, водителя и сборы. Поэтому выгоднее брать машину поближе.';
  if (has(text, 'наценк', 'маржа', 'прибыл'))
    return 'Наценка — твоя прибыль сверх себестоимости. На старте держись около 15–25%: меньше — рискуешь работать в ноль, больше — клиент может уйти.';
  if (has(text, 'формул', 'как счит', 'посчит', 'себестоим', 'расчет', 'расчёт'))
    return `Себестоимость = топливо с грузом + топливо порожняком + оплата водителя + дорожные сборы. Расход с грузом = базовый + вес в тоннах × ${CONSUMPTION_PER_TON} л/100 км. Цена клиенту = себестоимость × (1 + наценка/100).`;
  if (has(text, 'тахограф', 'отдых', 'водител'))
    return `В игре водитель может ехать ${MAX_DRIVE_HOURS} ч подряд, потом ${REST_HOURS} ч отдыха. Закладывай это в сроки длинных рейсов.`;
  if (has(text, 'пропус', 'скип', 'день'))
    return 'Пропуск дня экономит время, но пока тебя нет, бывают штрафы, повреждения груза и даже критические аварии. Чем больше машин в рейсе, тем выше риск.';
  if (has(text, 'вес', 'тонн'))
    return 'Вес бери из заявки клиента и переводи в тонны (кг / 1000). Проверь, что грузоподъёмность машины его выдерживает.';
  if (has(text, 'топлив', 'цена дизел'))
    return `Цена топлива сейчас ${s.market.fuelPrice} €/л — она меняется каждую ночь, смотри вкладку «Рынок».`;
  return 'Хороший вопрос! Порядок такой: выбери заказ → выбери ближайшую подходящую машину → найди расстояния в справочнике → возьми ставки во вкладке «Рынок» → добавь наценку → отправь цену клиенту.';
}
