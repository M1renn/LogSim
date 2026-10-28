// Автотест игрового движка: бот играет уровни, правильно считая цену.
// Запуск: npm test
import { calcCost } from '../shared/game';
import { advanceHour, newGame, skipDay, submitQuote, trueInputs, type GameState } from '../server/game/engine';
import { distanceKm } from '../server/game/data';
import { LEVELS } from '../server/game/data';

function botTurn(s: GameState) {
  for (const o of s.orders.filter((x) => x.status === 'new')) {
    const free = s.trucks
      .filter((t) => t.status === 'idle' && !t.orderId && t.capacityKg >= o.weightKg)
      .sort((a, b) => distanceKm(a.cityId, o.fromId) - distanceKm(b.cityId, o.fromId));
    const truck = free[0];
    if (!truck) continue;
    const margin = { easy: 25, normal: 20, hard: 15 }[s.difficulty];
    const inputs = trueInputs(s, o, truck, margin);
    const fb = submitQuote(s, o.id, truck.id, inputs, Math.round(calcCost(inputs).price));
    if (fb.errors.length) throw new Error(`Точный расчёт помечен как ошибочный: ${fb.errors.join('; ')}`);
  }
  advanceHour(s);
}

let wins = 0;
const RUNS = 40;
for (const level of LEVELS) {
  let won = 0;
  for (let i = 0; i < RUNS; i++) {
    const s = newGame('level', level.id);
    let guard = 0;
    while (s.status === 'playing' && guard++ < 1000) botTurn(s);
    if (s.status === 'won') won++;
    if (s.money !== s.money) throw new Error('NaN в деньгах');
  }
  wins += won;
  console.log(`${level.title}: бот прошёл ${won}/${RUNS}`);
}

// пропуск дня не ломает состояние
const s = newGame('free', null, 'hard');
for (let d = 0; d < 10 && s.status === 'playing'; d++) skipDay(s);
console.log(`Свободная игра, 10 пропусков дня: статус=${s.status}, день=${Math.floor(s.hour / 24) + 1}, деньги=${Math.round(s.money)}`);

// неверный расчёт должен находить ошибки
const g = newGame('level', 'l1');
const o = g.orders[0];
const t = g.trucks[0];
const wrong = { ...trueInputs(g, o, t, 20), distanceKm: o.distanceKm + 100, fuelPrice: 2 };
const fb = submitQuote(g, o.id, t.id, wrong, 99999);
console.log(`Проверка ошибок: найдено ${fb.errors.length} (ожидается 2), решение клиента: ${fb.decision}`);
if (fb.errors.length !== 2) process.exit(1);
if (wins === 0) process.exit(1);
console.log('OK');
