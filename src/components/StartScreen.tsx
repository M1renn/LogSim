import { useState } from 'react';
import type { Difficulty, GameMode, MetaInfo } from '../../shared/types';
import { fmtMoney } from '../../shared/game';

interface Props {
  meta: MetaInfo;
  saveInfo: { exists: boolean; title: string | null };
  onStart: (mode: GameMode, levelId: string | null, difficulty: Difficulty) => void;
  onContinue: () => void;
  onSettings: () => void;
}

export default function StartScreen({ meta, saveInfo, onStart, onContinue, onSettings }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="start">
      <header className="start-head">
        <div className="logo">
          <span className="logo-mark">◆</span> LogiSim
        </div>
        <p className="tagline">Пошаговый симулятор работы логиста для начинающих</p>
        <div className="start-actions">
          {saveInfo.exists && (
            <button className="btn primary" onClick={onContinue}>
              Продолжить: {saveInfo.title}
            </button>
          )}
          <button className="btn" onClick={onSettings}>
            Настройки ИИ
          </button>
        </div>
      </header>

      <section className="start-section">
        <h2>Уровни обучения</h2>
        <div className="level-grid">
          {meta.levels.map((l, i) => {
            const diff = meta.difficulties.find((d) => d.id === l.difficulty);
            return (
              <article key={l.id} className="level-card">
                <div className="level-num">{String(i + 1).padStart(2, '0')}</div>
                <h3>{l.title.replace(/^Уровень \d+\.\s*/, '')}</h3>
                <p>{l.description}</p>
                <dl className="level-facts">
                  <div>
                    <dt>Сложность</dt>
                    <dd>{diff?.label}</dd>
                  </div>
                  <div>
                    <dt>Срок</dt>
                    <dd>{l.days} дн.</dd>
                  </div>
                  <div>
                    <dt>Машин</dt>
                    <dd>{l.truckCities.length}</dd>
                  </div>
                  <div>
                    <dt>Цель</dt>
                    <dd>
                      {l.goalDeliveries} дост., {fmtMoney(l.goalProfit)}
                    </dd>
                  </div>
                </dl>
                <button className="btn primary" onClick={() => onStart('level', l.id, l.difficulty)}>
                  Начать уровень
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="start-section">
        <h2>Свободная игра</h2>
        <div className="free-play">
          <div className="diff-picker">
            {meta.difficulties.map((d) => (
              <label key={d.id} className={`diff-option ${difficulty === d.id ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="difficulty"
                  checked={difficulty === d.id}
                  onChange={() => setDifficulty(d.id)}
                />
                <strong>{d.label}</strong>
                <span>{d.description}</span>
              </label>
            ))}
          </div>
          <button className="btn primary big" onClick={() => onStart('free', null, difficulty)}>
            Начать свободную игру
          </button>
        </div>
      </section>
    </div>
  );
}
