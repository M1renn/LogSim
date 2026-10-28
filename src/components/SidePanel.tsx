import { useState } from 'react';
import type { MetaInfo, PublicGameState } from '../../shared/types';
import { CONSUMPTION_PER_TON, MAX_DRIVE_HOURS, REST_HOURS, fmtMoney, fmtTime } from '../../shared/game';
import { api } from '../api';
import { ORDER_STATUS, TRUCK_STATUS } from '../labels';

interface Props {
  meta: MetaInfo;
  state: PublicGameState;
  selectedOrderId: string | null;
  onSelectOrder: (id: string | null) => void;
  onSelectTruck: (id: string | null) => void;
  onState: (s: PublicGameState) => void;
}

type Tab = 'orders' | 'fleet' | 'market' | 'log';

export default function SidePanel(props: Props) {
  const [tab, setTab] = useState<Tab>('orders');
  const openCount = props.state.orders.filter((o) => o.status === 'new' || o.status === 'counter').length;

  return (
    <div className="side panel">
      <nav className="tabs">
        <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
          Заказы {openCount > 0 && <span className="pill">{openCount}</span>}
        </button>
        <button className={tab === 'fleet' ? 'active' : ''} onClick={() => setTab('fleet')}>
          Автопарк
        </button>
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>
          Рынок и расстояния
        </button>
        <button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
          Журнал
        </button>
      </nav>
      <div className="tab-body">
        {tab === 'orders' && <Orders {...props} />}
        {tab === 'fleet' && <Fleet {...props} />}
        {tab === 'market' && <MarketTab {...props} />}
        {tab === 'log' && <Log state={props.state} />}
      </div>
    </div>
  );
}

function Orders({ meta, state, selectedOrderId, onSelectOrder, onState }: Props) {
  const [showClosed, setShowClosed] = useState(false);
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id;
  const order = { new: 0, counter: 1, in_progress: 2, delivered: 3, rejected: 4, expired: 5 } as const;
  const list = [...state.orders]
    .filter((o) => showClosed || ['new', 'counter', 'in_progress'].includes(o.status))
    .sort((a, b) => order[a.status] - order[b.status] || b.createdHour - a.createdHour);

  return (
    <>
      <div className="list-tools">
        <label className="check">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          показать завершённые
        </label>
      </div>
      {!list.length && <p className="muted">Пока заказов нет. Сделайте ход — клиенты пишут в рабочее время (06–20).</p>}
      <ul className="cards">
        {list.map((o) => {
          const st = ORDER_STATUS[o.status];
          const quoteLeft = o.quoteBy - state.hour;
          const truck = state.trucks.find((t) => t.id === o.truckId);
          return (
            <li
              key={o.id}
              className={`card order ${selectedOrderId === o.id ? 'selected' : ''}`}
              onClick={() => onSelectOrder(o.id)}
            >
              <div className="card-row">
                <strong>{o.id}</strong>
                <span className={`badge ${st.tone}`}>{st.label}</span>
              </div>
              <div className="card-route">
                {cityName(o.fromId)} → {cityName(o.toId)}
              </div>
              <div className="card-meta">
                {o.client} · {o.cargo} · {(o.weightKg / 1000).toFixed(1)} т
              </div>
              <div className="card-meta">
                Доставить до {fmtTime(o.deadlineHour)}
                {(o.status === 'new' || o.status === 'counter') && (
                  <span className={quoteLeft <= 2 ? 'bad-text' : ''}> · ответить за {quoteLeft} ч</span>
                )}
              </div>
              {o.status === 'in_progress' && truck && (
                <div className="card-meta">
                  Машина #{truck.number}: {TRUCK_STATUS[truck.status].label.toLowerCase()}
                  {truck.leg && ` · осталось ${Math.round(truck.leg.totalKm - truck.leg.doneKm)} км`}
                </div>
              )}
              {o.result && (
                <div className={`card-meta ${o.result.profit >= 0 ? 'ok-text' : 'bad-text'}`}>
                  Прибыль {fmtMoney(o.result.profit)}
                  {o.result.late && ' (опоздание)'}
                </div>
              )}
              {o.status === 'new' && (
                <button
                  className="link-btn"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const r = await api.decline(o.id);
                    onState(r.state);
                  }}
                >
                  отказаться от заказа
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Fleet({ meta, state, onSelectTruck }: Props) {
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id;
  return (
    <ul className="cards">
      {state.trucks.map((t) => {
        const st = TRUCK_STATUS[t.status];
        const order = state.orders.find((o) => o.id === t.orderId);
        return (
          <li key={t.id} className="card" onClick={() => onSelectTruck(t.id)}>
            <div className="card-row">
              <strong>
                #{t.number} {t.model}
              </strong>
              <span className={`badge ${st.tone}`}>{st.label}</span>
            </div>
            <div className="card-meta">
              Водитель: {t.driverName} · {t.leg ? `${cityName(t.leg.fromId)} → ${cityName(t.leg.toId)}` : cityName(t.cityId)}
            </div>
            <dl className="specs">
              <div>
                <dt>Грузоподъёмность</dt>
                <dd>{t.capacityKg / 1000} т</dd>
              </div>
              <div>
                <dt>Базовый расход</dt>
                <dd>{t.baseConsumption} л/100 км</dd>
              </div>
              <div>
                <dt>За рулём</dt>
                <dd>
                  {Math.round(t.drivingHours)} / {MAX_DRIVE_HOURS} ч
                </dd>
              </div>
              <div>
                <dt>Заказ</dt>
                <dd>{order ? order.id : '—'}</dd>
              </div>
            </dl>
            {t.leg && (
              <div className="progress">
                <div style={{ width: `${(t.leg.doneKm / t.leg.totalKm) * 100}%` }} />
              </div>
            )}
            {t.timer > 0 && <div className="card-meta">До конца этапа: {t.timer} ч</div>}
          </li>
        );
      })}
    </ul>
  );
}

function MarketTab({ meta, state }: Props) {
  const [from, setFrom] = useState(state.trucks[0]?.cityId ?? meta.cities[0].id);
  const rows = meta.cities
    .filter((c) => c.id !== from)
    .map((c) => ({ c, km: meta.distances[from][c.id] }))
    .sort((a, b) => a.km - b.km);

  return (
    <div className="market">
      <dl className="market-grid">
        <div>
          <dt>Дизель</dt>
          <dd>{state.market.fuelPrice.toFixed(3)} €/л</dd>
        </div>
        <div>
          <dt>Оплата водителя</dt>
          <dd>{state.market.driverRatePerKm.toFixed(2)} €/км</dd>
        </div>
        <div>
          <dt>Дорожные сборы</dt>
          <dd>{state.market.tollPerKm.toFixed(2)} €/км</dd>
        </div>
        <div>
          <dt>Расход на тонну</dt>
          <dd>+{CONSUMPTION_PER_TON} л/100 км</dd>
        </div>
      </dl>
      <p className="muted small">
        Цена топлива меняется каждую ночь. Водитель едет до {MAX_DRIVE_HOURS} ч подряд, затем отдыхает {REST_HOURS} ч.
        Средняя скорость ~65 км/ч.
      </p>

      <h4>Справочник расстояний по дорогам</h4>
      <label className="field inline">
        <span className="field-label">Из города</span>
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {meta.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <table className="dist-table">
        <tbody>
          {rows.map(({ c, km }) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="muted">{c.country}</td>
              <td className="num">{km} км</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Log({ state }: { state: PublicGameState }) {
  return (
    <ul className="log">
      {[...state.log].reverse().map((l, i) => (
        <li key={i} className={l.kind}>
          <time>{fmtTime(l.hour)}</time>
          <span>{l.text}</span>
        </li>
      ))}
    </ul>
  );
}
