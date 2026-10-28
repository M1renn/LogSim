import { useEffect, useMemo, useState } from 'react';
import type { MetaInfo, PublicGameState, QuoteFeedback, QuoteInputs } from '../../shared/types';
import { CONSUMPTION_PER_TON, calcCost, fmtMoney, fmtTime } from '../../shared/game';
import { api } from '../api';
import { ORDER_STATUS } from '../labels';

interface Props {
  meta: MetaInfo;
  state: PublicGameState;
  orderId: string | null;
  truckId: string | null;
  onTruck: (id: string | null) => void;
  onState: (s: PublicGameState) => void;
}

type Key = keyof QuoteInputs;

const FIELDS: { key: Key; label: string; unit: string; hint: string; step: string }[] = [
  { key: 'distanceKm', label: 'Расстояние с грузом', unit: 'км', hint: 'Справочник: загрузка → выгрузка', step: '1' },
  { key: 'emptyKm', label: 'Порожний пробег', unit: 'км', hint: 'Справочник: город машины → загрузка', step: '1' },
  { key: 'weightT', label: 'Вес груза', unit: 'т', hint: 'Из заявки: кг ÷ 1000', step: '0.1' },
  { key: 'consumption', label: 'Базовый расход', unit: 'л/100 км', hint: 'Автопарк: характеристики машины', step: '0.1' },
  { key: 'fuelPrice', label: 'Цена топлива', unit: '€/л', hint: 'Вкладка «Рынок»', step: '0.001' },
  { key: 'driverRate', label: 'Ставка водителя', unit: '€/км', hint: 'Вкладка «Рынок»', step: '0.01' },
  { key: 'tollRate', label: 'Дорожные сборы', unit: '€/км', hint: 'Вкладка «Рынок»', step: '0.01' },
  { key: 'marginPct', label: 'Наценка', unit: '%', hint: 'Ваша прибыль, обычно 15–25%', step: '1' },
];

const EMPTY: Record<Key, string> = {
  distanceKm: '',
  emptyKm: '',
  weightT: '',
  consumption: '',
  fuelPrice: '',
  driverRate: '',
  tollRate: '',
  marginPct: '20',
};

export default function CalcPanel({ meta, state, orderId, truckId, onTruck, onState }: Props) {
  const [values, setValues] = useState<Record<Key, string>>(EMPTY);
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [feedback, setFeedback] = useState<QuoteFeedback | null>(null);
  const [busy, setBusy] = useState(false);

  const order = state.orders.find((o) => o.id === orderId) ?? null;
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id;
  const showHints = state.difficulty !== 'hard';

  // при смене заказа — чистая форма
  useEffect(() => {
    setValues(EMPTY);
    setPrice('');
    setPriceTouched(false);
    setFeedback(null);
  }, [orderId]);

  const freeTrucks = state.trucks.filter((t) => t.status === 'idle' && !t.orderId);
  const truck = state.trucks.find((t) => t.id === truckId) ?? null;

  // если выбранная машина занята — предлагаем первую свободную
  useEffect(() => {
    if (order?.status === 'new' && (!truck || truck.orderId || truck.status !== 'idle')) {
      onTruck(freeTrucks[0]?.id ?? null);
    }
  }, [order?.id, order?.status, truck?.id, truck?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs: QuoteInputs = useMemo(() => {
    const n = (k: Key) => Number(String(values[k]).replace(',', '.')) || 0;
    return {
      distanceKm: n('distanceKm'),
      emptyKm: n('emptyKm'),
      weightT: n('weightT'),
      fuelPrice: n('fuelPrice'),
      consumption: n('consumption'),
      driverRate: n('driverRate'),
      tollRate: n('tollRate'),
      marginPct: n('marginPct'),
    };
  }, [values]);
  const calc = calcCost(inputs);
  const shownPrice = priceTouched ? price : calc.price ? String(Math.round(calc.price)) : '';

  if (!order) {
    return (
      <div className="calc panel empty-state">
        <h3>Расчёт стоимости перевозки</h3>
        <p>Выберите заказ во вкладке «Заказы» справа — здесь появится форма расчёта цены для клиента.</p>
      </div>
    );
  }

  const submit = async () => {
    if (!truck) return;
    setBusy(true);
    try {
      const r = await api.quote(order.id, truck.id, inputs, Number(shownPrice));
      onState(r.state);
      setFeedback(r.feedback);
    } catch (e) {
      setFeedback({
        decision: 'invalid',
        message: (e as Error).message,
        errors: [],
        tips: [],
        playerCost: 0,
        trueCost: null,
        etaHours: 0,
      });
    } finally {
      setBusy(false);
    }
  };

  const counter = async (accept: boolean) => {
    setBusy(true);
    try {
      const r = await api.counter(order.id, accept);
      onState(r.state);
      setFeedback((f) => (f ? { ...f, message: r.message, decision: accept ? 'accepted' : 'rejected' } : f));
    } finally {
      setBusy(false);
    }
  };

  const status = ORDER_STATUS[order.status];

  return (
    <div className="calc panel">
      <header className="calc-head">
        <div>
          <h3>
            Расчёт: {order.id} <span className={`badge ${status.tone}`}>{status.label}</span>
          </h3>
          <p className="calc-sub">
            {order.client} · {order.cargo} · {(order.weightKg).toLocaleString('ru-RU')} кг · {cityName(order.fromId)} →{' '}
            {cityName(order.toId)} · доставить до {fmtTime(order.deadlineHour)}
          </p>
        </div>
        {order.status === 'new' && (
          <label className="truck-select">
            <span>Машина</span>
            <select value={truck?.id ?? ''} onChange={(e) => onTruck(e.target.value || null)}>
              {!freeTrucks.length && <option value="">нет свободных машин</option>}
              {freeTrucks.map((t) => (
                <option key={t.id} value={t.id}>
                  #{t.number} {t.model} — {cityName(t.cityId)}
                  {t.capacityKg < order.weightKg ? ' (не хватит грузоподъёмности)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {order.status === 'new' && (
        <>
          <div className="calc-grid">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="field-label">
                  {f.label} <em>{f.unit}</em>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step={f.step}
                  min="0"
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                {showHints && <span className="field-hint">{f.hint}</span>}
              </label>
            ))}
          </div>

          <div className="calc-bottom">
            <div className="breakdown">
              <Line label="Топливо с грузом" value={calc.fuelLoaded} />
              <Line label="Топливо порожняком" value={calc.fuelEmpty} />
              <Line label="Водитель" value={calc.driver} />
              <Line label="Дорожные сборы" value={calc.tolls} />
              <Line label="Себестоимость" value={calc.cost} strong />
              {state.difficulty === 'easy' && (
                <p className="formula">
                  Расход с грузом = базовый + вес × {CONSUMPTION_PER_TON} л/100 км. Цена = себестоимость × (1 +
                  наценка/100).
                </p>
              )}
            </div>
            <div className="offer">
              <label className="field">
                <span className="field-label">
                  Цена для клиента <em>€</em>
                </span>
                <input
                  className="price-input"
                  type="number"
                  min="0"
                  value={shownPrice}
                  onChange={(e) => {
                    setPriceTouched(true);
                    setPrice(e.target.value);
                  }}
                />
              </label>
              {priceTouched && (
                <button className="link-btn" onClick={() => setPriceTouched(false)}>
                  вернуть расчётную цену
                </button>
              )}
              <button className="btn primary" disabled={busy || !truck || !Number(shownPrice)} onClick={submit}>
                Отправить предложение
              </button>
            </div>
          </div>
        </>
      )}

      {order.status === 'counter' && (
        <div className="counter-box">
          <p>
            Клиент предлагает <strong>{fmtMoney(order.counterPrice ?? 0)}</strong>. Подумайте, покрывает ли эта сумма
            себестоимость.
          </p>
          <div className="modal-actions">
            <button className="btn" disabled={busy} onClick={() => counter(false)}>
              Отказаться
            </button>
            <button className="btn primary" disabled={busy} onClick={() => counter(true)}>
              Согласиться
            </button>
          </div>
        </div>
      )}

      {order.status !== 'new' && order.status !== 'counter' && (
        <div className="order-summary">
          {order.price != null && <p>Цена перевозки: {fmtMoney(order.price)}</p>}
          {order.result && (
            <p className={order.result.profit >= 0 ? 'ok-text' : 'bad-text'}>
              Затраты {fmtMoney(order.result.cost)}
              {order.result.penalty ? `, штраф ${fmtMoney(order.result.penalty)}` : ''} → прибыль{' '}
              {fmtMoney(order.result.profit)}
            </p>
          )}
          {order.status === 'in_progress' && <p>Заказ выполняется — следите за водителем в чате.</p>}
        </div>
      )}

      {feedback && (
        <div className={`feedback ${feedback.decision}`}>
          <p className="feedback-msg">{feedback.message}</p>
          {feedback.decision !== 'invalid' && (
            <p className="feedback-meta">
              Ваша себестоимость: {fmtMoney(feedback.playerCost)}
              {feedback.trueCost != null && ` · правильная: ${fmtMoney(feedback.trueCost)}`} · время рейса ~
              {feedback.etaHours} ч
            </p>
          )}
          {feedback.errors.length > 0 && (
            <ul className="feedback-errors">
              {feedback.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {feedback.tips.map((t) => (
            <p key={t} className="feedback-tip">
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`bd-line ${strong ? 'strong' : ''}`}>
      <span>{label}</span>
      <span>{value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
    </div>
  );
}
