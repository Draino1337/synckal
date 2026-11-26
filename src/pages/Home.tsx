import { useEffect, useState } from 'react';
import { go, link } from '../router.ts';
import { roomFromInput, thumb } from '../lib/util.ts';
import { Icon } from '../components/Icon.tsx';

interface PublicRoom {
  id: string;
  title: string;
  users: number;
  videoId: string | null;
  video: string;
}

const STEPS = [
  { icon: 'tv', title: 'Создай комнату', text: 'Один клик, без регистрации. У комнаты своя короткая ссылка.' },
  { icon: 'link', title: 'Позови друзей', text: 'Скинь ссылку в чат. Каждый заходит со своим ником.' },
  { icon: 'play', title: 'Смотрите вместе', text: 'Пауза, перемотка и скорость — у всех одновременно. Очередь общая.' },
];

const FEATURES = [
  ['sync', 'Синхронизация', 'Часы каждого сверяются с сервером. Кто отстал больше чем на секунду — его подмотает.'],
  ['list', 'Общая очередь', 'Добавляй по ссылке, ставь следующим, перетаскивай, перемешивай. Видео идут друг за другом.'],
  ['chat', 'Чат', 'Ссылку на YouTube из чата можно одним нажатием отправить в очередь.'],
  ['crown', 'Ведущий и права', 'Создатель — ведущий. Он решает, кто управляет плеером, назначает модераторов.'],
  ['skip', 'Голосование', 'Если управлять могут не все — за пропуск видео голосуют. Большинство решает.'],
  ['vol', 'Громкость — своя', 'Звук и полноэкранный режим у каждого свои и никому не мешают.'],
] as const;

export function Home() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [online, setOnline] = useState(0);
  const bad = code.trim() !== '' && !roomFromInput(code);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch('/api/rooms')
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          setRooms(d.rooms);
          setOnline(d.online);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/new', { method: 'POST' }).then((r) => r.json());
      go(`/r/${r.room}`);
    } catch {
      setBusy(false);
      alert('Сервер недоступен. Попробуй ещё раз.');
    }
  };

  return (
    <div className="wrap home">
      <section className="hero">
        <span className="label rv">Без регистрации · бесплатно</span>
        <h1 className="hero-h rv">
          Смотрим YouTube
          <br />
          <span className="glitch dither" data-text="вместе">
            <span aria-hidden="true">вместе</span>
            <span className="sr-only">вместе</span>
          </span>
          <i className="caret" aria-hidden="true" />
        </h1>
        <p className="lead rv">Комната по ссылке, общая очередь и чат. Нажал паузу — пауза у всех. Перемотал — перемотало у всех.</p>

        <div className="hero-cta rv">
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            <Icon name="plus" /> Создать комнату
          </button>
          <form
            className="join"
            onSubmit={(e) => {
              e.preventDefault();
              const r = roomFromInput(code);
              if (r) go(`/r/${r}`);
            }}
          >
            <label className="q-field px px-well">
              <Icon name="link" />
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код или ссылка комнаты" aria-label="Код или ссылка комнаты" aria-invalid={bad} />
            </label>
            <button className="btn btn-ghost btn-sm" disabled={!roomFromInput(code)}>
              Войти <Icon name="arrow" size={14} />
            </button>
          </form>
        </div>
        {online > 0 && (
          <p className="hero-online rv">
            <i /> сейчас смотрят: {online}
          </p>
        )}
      </section>

      {rooms.length > 0 && (
        <section className="sec">
          <h2 className="label rv">Открытые комнаты</h2>
          <div className="rooms">
            {rooms.map((r) => (
              <a key={r.id} href={`/r/${r.id}`} onClick={link} className="room-card card hov rv">
                {r.videoId ? <img src={thumb(r.videoId)} alt="" loading="lazy" /> : <div className="room-blank">ничего не играет</div>}
                <div>
                  <b>{r.title || `Комната ${r.id}`}</b>
                  <small>{r.video || '—'}</small>
                  <span className="chip">
                    <Icon name="users" size={12} /> {r.users}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <h2 className="label rv">Как это работает</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card rv">
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <Icon name={s.icon} size={22} />
              <b>{s.title}</b>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="sec">
        <h2 className="label rv">Что умеет</h2>
        <div className="feats">
          {FEATURES.map(([icon, title, text]) => (
            <div key={title} className="feat card hov rv">
              <Icon name={icon} size={20} />
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
