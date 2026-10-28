import { useState } from 'react';
import type { MetaInfo, PublicGameState, SkipReport } from '../../shared/types';
import { dayOf, fmtMoney, fmtTime } from '../../shared/game';
import { api } from '../api';
import MapView from './MapView';
import CalcPanel from './CalcPanel';
import SidePanel from './SidePanel';
import ChatPanel from './ChatPanel';
import Modal from './Modal';

interface Props {
  meta: MetaInfo;
  state: PublicGameState;
  setState: (s: PublicGameState) => void;
  onMenu: () => void;
  onSettings: () => void;
}

export default function GameScreen({ meta, state, setState, onMenu, onSettings }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [skipReport, setSkipReport] = useState<SkipReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ state: PublicGameState }>) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      setState(r.state);
      return r;
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nextTurn = (hours = 1) => run(() => api.turn(hours));
  const doSkip = async () => {
    setConfirmSkip(false);
    const r = (await run(() => api.skipDay())) as { report: SkipReport } | undefined;
    if (r) setSkipReport(r.report);
  };

  const profit = state.money - state.startMoney;
  const hoursLeft = state.endHour != null ? Math.max(0, state.endHour - state.hour) : null;
  const playing = state.status === 'playing';
  const activeTrucks = state.trucks.filter((t) => t.orderId).length;

  return (
    <div className="game">
      <header className="topbar">
        <div className="tb-left">
          <button className="btn ghost small" onClick={onMenu} title="В главное меню (игра сохранена)">
            ← Меню
          </button>
          <div className="tb-title">
            <span className="logo-mark">◆</span> {state.levelTitle}
          </div>
        </div>

        <div className="tb-stats">
          <Stat label="Время" value={fmtTime(state.hour).replace('день', 'День')} />
          {hoursLeft != null && <Stat label="До конца" value={`${hoursLeft} ч`} tone={hoursLeft < 24 ? 'warn' : undefined} />}
          <Stat label="Счёт" value={fmtMoney(state.money)} tone={state.money < 1000 ? 'bad' : undefined} />
          <Stat label="Прибыль" value={fmtMoney(profit)} tone={profit >= 0 ? 'ok' : 'bad'} />
          <Stat label="Репутация" value={`${state.reputation}/100`} tone={state.reputation < 30 ? 'bad' : undefined} />
          {state.goalDeliveries != null && (
            <Stat
              label="Цель"
              value={`${state.stats.deliveries}/${state.goalDeliveries} дост. · ${fmtMoney(Math.max(0, profit))}/${fmtMoney(state.goalProfit ?? 0)}`}
            />
          )}
        </div>

        <div className="tb-actions">
          <button className="btn small" onClick={onSettings}>
            ИИ
          </button>
          <button className="btn primary" disabled={!playing || busy} onClick={() => nextTurn(1)}>
            Ход +1 ч
          </button>
          <button className="btn" disabled={!playing || busy} onClick={() => nextTurn(4)} title="Сыграть 4 хода подряд">
            +4 ч
          </button>
          <button className="btn danger" disabled={!playing || busy} onClick={() => setConfirmSkip(true)}>
            Пропустить день ⚠
          </button>
        </div>
      </header>

      <main className="game-main">
        <section className="col-left">
          <MapView
            meta={meta}
            state={state}
            selectedOrderId={selectedOrderId}
            selectedTruckId={selectedTruckId}
            onSelectOrder={setSelectedOrderId}
            onSelectTruck={setSelectedTruckId}
          />
          <CalcPanel
            meta={meta}
            state={state}
            orderId={selectedOrderId}
            truckId={selectedTruckId}
            onTruck={setSelectedTruckId}
            onState={setState}
          />
        </section>
        <section className="col-right">
          <SidePanel
            meta={meta}
            state={state}
            selectedOrderId={selectedOrderId}
            onSelectOrder={setSelectedOrderId}
            onSelectTruck={setSelectedTruckId}
            onState={setState}
          />
          <ChatPanel state={state} onState={setState} />
        </section>
      </main>

      {confirmSkip && (
        <Modal title="Пропустить день?" onClose={() => setConfirmSkip(false)}>
          <p>
            Игра сразу промотает 24 часа. Пока вас нет, никто не отвечает клиентам и не контролирует водителей:
            возможны штрафы, повреждения груза и ушедшие клиенты.
          </p>
          <p className={activeTrucks ? 'warn-text' : ''}>
            {state.mode === 'level'
              ? 'Есть шанс критического инцидента, который сразу провалит уровень.'
              : 'Есть шанс критического инцидента с крупными потерями.'}{' '}
            {activeTrucks > 0 && `Машин в рейсе: ${activeTrucks} — риск выше.`}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirmSkip(false)}>
              Отмена
            </button>
            <button className="btn danger" onClick={doSkip}>
              Рискнуть и пропустить
            </button>
          </div>
        </Modal>
      )}

      {skipReport && playing && (
        <Modal title={`Прошло ${skipReport.hours} ч — ${fmtTime(state.hour)}`} onClose={() => setSkipReport(null)}>
          {skipReport.incidents.length ? (
            <>
              <p>Пока вас не было:</p>
              <ul className="incident-list">
                {skipReport.incidents.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>День прошёл спокойно. Повезло! Проверьте журнал и чаты.</p>
          )}
          <div className="modal-actions">
            <button className="btn primary" onClick={() => setSkipReport(null)}>
              Понятно
            </button>
          </div>
        </Modal>
      )}

      {!playing && (
        <Modal title={state.status === 'won' ? 'Уровень пройден!' : 'Игра окончена'} onClose={onMenu}>
          <p className={state.status === 'won' ? 'ok-text' : 'bad-text'}>{state.endReason}</p>
          <dl className="result-grid">
            <div>
              <dt>Дней в игре</dt>
              <dd>{dayOf(state.hour)}</dd>
            </div>
            <div>
              <dt>Доставок</dt>
              <dd>
                {state.stats.deliveries} (вовремя {state.stats.onTime})
              </dd>
            </div>
            <div>
              <dt>Прибыль</dt>
              <dd>{fmtMoney(profit)}</dd>
            </div>
            <div>
              <dt>Точных расчётов</dt>
              <dd>
                {state.stats.accurateQuotes}/{state.stats.quotes}
              </dd>
            </div>
          </dl>
          <div className="modal-actions">
            <button className="btn primary" onClick={onMenu}>
              В главное меню
            </button>
          </div>
        </Modal>
      )}

      {notice && (
        <div className="toast bad" onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
