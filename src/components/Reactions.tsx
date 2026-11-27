import { useEffect, useRef } from 'react';
import { REACTIONS, type Reaction } from '../lib/room.ts';

/** Кнопки реакций под видео; клавиши 1–6 — то же самое, работают и во весь экран. */
export function ReactBar({ send }: { send: (msg: Record<string, unknown>) => void }) {
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const r = REACTIONS[Number(e.key) - 1];
      if (!r) return;
      e.preventDefault();
      sendRef.current({ t: 'react', r });
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  return (
    <div className="reacts" role="group" aria-label="Реакции">
      {REACTIONS.map((r, i) => (
        <button key={r} className="react-btn" onClick={() => send({ t: 'react', r })} title={`Реакция (${i + 1})`} aria-label={`Реакция ${r}`}>
          {r}
        </button>
      ))}
    </div>
  );
}

/** Всплывающие реакции поверх видео. */
export function ReactLayer({ reacts }: { reacts: Reaction[] }) {
  return (
    <div className="pl-reacts" aria-hidden="true">
      {reacts.map((x) => (
        <span key={x.id} className="pl-react" style={{ left: `${x.x * 100}%`, color: x.color }}>
          <b>{x.r}</b>
          <small>{x.name}</small>
        </span>
      ))}
    </div>
  );
}
