import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../lib/room.ts';
import { findYoutube } from '../lib/util.ts';
import { Icon } from './Icon.tsx';

interface Props {
  chat: ChatMsg[];
  you: string | null;
  canControl: boolean;
  send: (m: Record<string, unknown>) => void;
}

const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** текст с кликабельными ссылками */
function Text({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
}

export function Chat({ chat, you, canControl, send }: Props) {
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // прокручен ли чат до конца — тогда новые сообщения его прокручивают

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat]);

  return (
    <section className="chat px">
      <div className="chat-head">
        <span className="label">Чат</span>
      </div>
      <div
        className="chat-list"
        ref={list}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && <p className="chat-none">Здесь пока тихо. Напиши что-нибудь!</p>}
        {chat.map((m) => {
          if (m.sys)
            return (
              <p key={m.id} className="msg msg-sys">
                <time>{hhmm(m.ts)}</time> {m.text}
              </p>
            );
          const yt = canControl ? findYoutube(m.text) : null;
          return (
            <p key={m.id} className={m.uid === you ? 'msg is-me' : 'msg'}>
              <time>{hhmm(m.ts)}</time>
              <b style={{ color: m.color }}>{m.name}</b>
              <span>
                <Text text={m.text} />
              </span>
              {yt && (
                <button className="msg-add" onClick={() => send({ t: 'add', url: yt, mode: 'end' })} title="Добавить в очередь">
                  <Icon name="plus" size={12} /> в очередь
                </button>
              )}
            </p>
          );
        })}
      </div>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          send({ t: 'chat', text: t });
          setText('');
          stick.current = true;
        }}
      >
        <label className="q-field px px-well">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Сообщение…" maxLength={500} aria-label="Сообщение в чат" />
        </label>
        <button className="chat-send" type="submit" aria-label="Отправить" disabled={!text.trim()}>
          <Icon name="arrow" />
        </button>
      </form>
    </section>
  );
}
