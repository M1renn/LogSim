import { useEffect, useRef, useState } from 'react';
import type { PublicGameState } from '../../shared/types';
import { fmtTime } from '../../shared/game';
import { api } from '../api';

interface Props {
  state: PublicGameState;
  onState: (s: PublicGameState) => void;
}

const ROLE_ICON = { mentor: '★', client: '€', driver: '⛟' } as const;

export default function ChatPanel({ state, onState }: Props) {
  const [threadId, setThreadId] = useState('mentor');
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const thread = state.threads.find((t) => t.id === threadId) ?? state.threads[0];
  const messages = state.messages.filter((m) => m.threadId === thread.id);

  // открытый чат считается прочитанным
  useEffect(() => {
    if (thread.unread > 0) api.read(thread.id).then((r) => onState(r.state)).catch(() => undefined);
  }, [thread.id, thread.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, pending, thread.id]);

  const send = async () => {
    const t = text.trim();
    if (!t || pending) return;
    setPending(t);
    setText('');
    try {
      const r = await api.chat(thread.id, t);
      onState(r.state);
    } catch {
      setText(t);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="chat panel">
      <nav className="chat-threads">
        {state.threads.map((t) => (
          <button key={t.id} className={t.id === thread.id ? 'active' : ''} onClick={() => setThreadId(t.id)}>
            <span className="role-icon">{ROLE_ICON[t.role]}</span>
            {t.title}
            {t.unread > 0 && t.id !== thread.id && <span className="pill">{t.unread}</span>}
          </button>
        ))}
      </nav>
      <div className="chat-list" ref={listRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.from}`}>
            <div className="msg-head">
              <span>{m.author}</span>
              <time>{fmtTime(m.hour)}</time>
            </div>
            <div className="msg-text">{m.text}</div>
          </div>
        ))}
        {pending && (
          <>
            <div className="msg player">
              <div className="msg-text">{pending}</div>
            </div>
            <div className="msg npc typing">печатает…</div>
          </>
        )}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          maxLength={500}
          placeholder={
            thread.role === 'mentor'
              ? 'Спросите наставника: как посчитать порожний пробег?'
              : thread.role === 'driver'
                ? 'Напишите водителю: где ты сейчас?'
                : 'Напишите клиенту (укажите номер заказа)'
          }
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn primary" disabled={!text.trim() || Boolean(pending)}>
          Отправить
        </button>
      </form>
    </div>
  );
}
