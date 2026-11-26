import { useEffect, useState } from 'react';
import { go, link } from '../router.ts';
import { roomFromInput, thumb } from '../lib/util.ts';
import { Icon } from '../components/Icon.tsx';
import type { Role } from '../lib/room.ts';

interface ListedRoom {
  id: string;
  title: string;
  users: { name: string; color: string; role: Role }[];
  videoId: string | null;
  video: string;
  author: string;
  playing: boolean;
  queue: number;
}

/** «Аня, Боря и ещё 3» */
function names(users: ListedRoom['users']) {
  const shown = users.slice(0, 3).map((u) => u.name);
  const rest = users.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` и ещё ${rest}` : '');
}

function RoomCard({ r }: { r: ListedRoom }) {
  return (
    <a href={`/r/${r.id}`} onClick={link} className="rc card hov rv">
      <div className="rc-shot">
        {r.videoId ? <img src={thumb(r.videoId)} alt="" loading="lazy" width={320} height={180} /> : <pre className="rc-tv" aria-hidden="true">{'[ ▶ ]\nпусто'}</pre>}
        <span className={r.playing ? 'rc-state is-live' : 'rc-state'}>
          {r.videoId ? (r.playing ? <><i /> смотрят</> : 'пауза') : 'ничего не играет'}
        </span>
        {r.queue > 0 && <span className="rc-queue">+{r.queue} в очереди</span>}
      </div>
      <div className="rc-body">
        <b className="rc-video" title={r.video}>
          {r.video || 'Ждут, кто включит видео'}
        </b>
        {r.author && <small className="rc-author">{r.author}</small>}
        <div className="rc-foot">
          <span className="rc-faces" aria-hidden="true">
            {r.users.slice(0, 5).map((u, i) => (
              <i key={i} style={{ background: u.color }} title={u.name}>
                {[...u.name][0]?.toUpperCase()}
              </i>
            ))}
          </span>
          <span className="rc-people">
            <span className="sr-only">В комнате: </span>
            {names(r.users)}
          </span>
        </div>
        <span className="rc-name">
          {r.title || 'Комната'} <em>/r/{r.id}</em>
        </span>
      </div>
    </a>
  );
}

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const room = roomFromInput(code);
  const bad = code.trim() !== '' && !room;

  // список комнат обновляется раз в 5 секунд, пока вкладка видна
  useEffect(() => {
    let dead = false;
    const load = () => {
      if (document.hidden) return;
      fetch('/api/rooms')
        .then((r) => r.json())
        .then((d) => !dead && setRooms(d.rooms))
        .catch(() => !dead && setRooms((prev) => prev ?? []));
    };
    load();
    const id = setInterval(load, 5000);
    document.addEventListener('visibilitychange', load);
    return () => {
      dead = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

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
      <section className="hero">
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
      </section>

      <section className="rooms" aria-labelledby="rooms-h">
        <h2 id="rooms-h" className="label">
          Комнаты{rooms && rooms.length > 0 ? ` · ${rooms.length}` : ''}
        </h2>
        {rooms === null ? (
          <p className="rooms-none">Загружаем…</p>
        ) : rooms.length === 0 ? (
          <p className="rooms-none">Сейчас никто не смотрит. Создай комнату — она появится здесь.</p>
        ) : (
          <div className="rooms-grid">
            {rooms.map((r) => (
              <RoomCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
