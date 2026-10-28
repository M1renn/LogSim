import { useEffect, useState } from 'react';
import type { AiProvider, AiSettingsPublic, MetaInfo } from '../../shared/types';
import { api } from '../api';
import Modal from './Modal';

export default function SettingsModal({ meta, onClose }: { meta: MetaInfo; onClose: () => void }) {
  const [s, setS] = useState<AiSettingsPublic | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings().then(setS).catch(() => undefined);
  }, []);

  if (!s) return null;
  const preset = meta.providers.find((p) => p.id === s.provider)!;

  const changeProvider = (id: AiProvider) => {
    const p = meta.providers.find((x) => x.id === id)!;
    setS({ ...s, provider: id, baseUrl: p.baseUrl, model: p.model });
    setStatus(null);
  };

  const save = async (test: boolean) => {
    setBusy(true);
    setStatus(null);
    try {
      const saved = await api.saveSettings({ provider: s.provider, model: s.model, baseUrl: s.baseUrl, apiKey });
      setS(saved);
      setApiKey('');
      if (test) {
        const r = await api.testSettings();
        setStatus({ ok: r.ok, text: r.ok ? `Связь есть: «${r.reply}»` : `Ошибка: ${r.reply}` });
      } else {
        setStatus({ ok: true, text: 'Сохранено' });
      }
    } catch (e) {
      setStatus({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Настройки ИИ-персонажей" onClose={onClose}>
      <p className="muted small">
        Чаты с клиентами, водителями и наставником могут работать через бесплатный ИИ-провайдер или через встроенного
        офлайн-бота. Решения в игре (цены, штрафы, поломки) всегда принимает игровой движок — ИИ только озвучивает
        персонажей.
      </p>
      <label className="field">
        <span className="field-label">Провайдер</span>
        <select value={s.provider} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
          {meta.providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {s.provider !== 'offline' && (
        <>
          <label className="field">
            <span className="field-label">Адрес API</span>
            <input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Модель</span>
            <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">
              API-ключ {s.hasKey && <em>(сохранён — оставьте пустым, чтобы не менять; «-» чтобы удалить)</em>}
            </span>
            <input
              type="password"
              value={apiKey}
              placeholder={preset.needsKey ? 'вставьте ключ' : 'не обязателен'}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
          <p className="muted small">
            Ключ хранится только на этом компьютере. Бесплатные лимиты и названия моделей у провайдеров меняются —
            проверьте актуальные в кабинете провайдера.
          </p>
        </>
      )}
      {status && <p className={status.ok ? 'ok-text' : 'bad-text'}>{status.text}</p>}
      <div className="modal-actions">
        <button className="btn" disabled={busy} onClick={() => save(true)}>
          Проверить связь
        </button>
        <button className="btn primary" disabled={busy} onClick={() => save(false)}>
          Сохранить
        </button>
      </div>
    </Modal>
  );
}
