import { useState } from 'react';
import { go } from '../router.ts';
import { roomFromInput } from '../lib/util.ts';
import { Icon } from '../components/Icon.tsx';

/** Главная — только два действия: создать комнату или войти по коду/ссылке. */
export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const room = roomFromInput(code);
  const bad = code.trim() !== '' && !room;

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/new', { method: 'POST' });
      if (!r.ok) throw new Error(String(r.status));
      go(`/r/${(await r.json()).room}`);
    } catch {
      setBusy(false);
      setErr('Сервер не отвечает. Если сайт долго не открывали, он просыпается — попробуй через полминуты.');
    }
  };

  return (
    <div className="wrap home">
      <h1 className="hero-h">
        Смотрим YouTube
        <br />
        <span className="glitch dither" data-text="вместе">
          <span aria-hidden="true">вместе</span>
          <span className="sr-only">вместе</span>
        </span>
        <i className="caret" aria-hidden="true" />
      </h1>

      <div className="hero-cta">
        <button className="btn btn-primary" onClick={create} disabled={busy}>
          <Icon name="plus" /> {busy ? 'Создаём…' : 'Создать комнату'}
        </button>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            if (room) go(`/r/${room}`);
          }}
        >
          <label className="q-field px px-well">
            <Icon name="link" />
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код или ссылка комнаты" aria-label="Код или ссылка комнаты" aria-invalid={bad} />
          </label>
          <button className="btn btn-ghost btn-sm" disabled={!room}>
            Войти <Icon name="arrow" size={14} />
          </button>
        </form>
      </div>
      {err && (
        <p className="home-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
