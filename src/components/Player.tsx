import { useCallback, useEffect, useRef, useState } from 'react';
import { expectedPos, type PlayerState } from '../lib/room.ts';
import { loadYT, S, YT_ERRORS } from '../lib/youtube.ts';
import { fmtTime, store } from '../lib/util.ts';
import { Icon } from './Icon.tsx';

interface Props {
  player: PlayerState;
  serverNow: () => number;
  canControl: boolean;
  send: (m: Record<string, unknown>) => void;
  skip: { votes: number; need: number };
  notify: (text: string) => void;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DRIFT_PLAYING = 1; // с — больше этого отставания при воспроизведении подматываем
const DRIFT_PAUSED = 0.4;

/**
 * Плеер YouTube без родных кнопок: управление своё, чтобы любое действие уходило на сервер
 * и не путалось с подстройкой. Раз в 250 мс сверяем плеер с состоянием комнаты:
 * то ли видео, играет/пауза, скорость, позиция (с поправкой на серверные часы).
 */
export function Player({ player, serverNow, canControl, send, skip, notify }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null);
  const [ready, setReady] = useState(false);
  const P = useRef(player);
  P.current = player;
  const sendRef = useRef(send);
  sendRef.current = send;

  const loaded = useRef<string | null>(null); // какое видео сейчас в плеере
  const cuedAt = useRef(0); // с какой секунды «заряжено» видео на паузе
  const lastSeek = useRef(0);
  const endedRev = useRef(-1);
  const playSince = useRef(0); // когда начали безуспешно запускать воспроизведение
  const errorRef = useRef<number | null>(null);

  const [error, setError] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false); // браузер не дал включить звук — играем без звука
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buf, setBuf] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [scrub, setScrub] = useState<number | null>(null);
  const [vol, setVol] = useState(() => Number(store.get('vol') ?? 80));
  const [muted, setMuted] = useState(() => store.get('muted') === '1');
  const [full, setFull] = useState(false);

  const fail = (code: number | null) => {
    errorRef.current = code;
    setError(code);
  };

  // плеер создаём один раз
  useEffect(() => {
    let dead = false;
    const el = host.current!;
    loadYT().then((YT) => {
      if (dead) return;
      const div = document.createElement('div');
      el.appendChild(div);
      yt.current = new YT.Player(div, {
        width: '100%',
        height: '100%',
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, modestbranding: 1, origin: location.origin },
        events: {
          onReady: () => !dead && setReady(true),
          onStateChange: (e: YT.PlayerEvent) => {
            if (e.data === S.PLAYING) fail(null);
            if (e.data === S.ENDED) {
              const s = P.current;
              if (s.playing && endedRev.current !== s.rev) {
                endedRev.current = s.rev;
                sendRef.current({ t: 'ended', rev: s.rev });
              }
            }
          },
          onError: (e: YT.PlayerEvent) => fail(e.data),
          onAutoplayBlocked: () => setBlocked(true),
        },
      });
    });
    return () => {
      dead = true;
      yt.current?.destroy();
      yt.current = null;
      loaded.current = null;
      el.innerHTML = '';
    };
  }, []);

  const sync = useCallback(() => {
    const p = yt.current;
    if (!p || !ready) return;
    const s = P.current;
    if (!s.videoId) {
      if (loaded.current) {
        p.stopVideo();
        loaded.current = null;
      }
      return;
    }
    const want = expectedPos(s, serverNow());

    // новое видео
    if (loaded.current !== s.videoId) {
      loaded.current = s.videoId;
      fail(null);
      lastSeek.current = Date.now();
      if (s.playing) {
        p.loadVideoById({ videoId: s.videoId, startSeconds: want });
        playSince.current = Date.now();
      } else {
        p.cueVideoById({ videoId: s.videoId, startSeconds: want });
        cuedAt.current = want;
      }
      return;
    }
    if (errorRef.current !== null) return;

    if (Math.abs(p.getPlaybackRate() - s.rate) > 0.01) p.setPlaybackRate(s.rate);
    const st = p.getPlayerState();
    const t = p.getCurrentTime();
    const d = p.getDuration();

    if (s.playing) {
      // время ролика вышло, а «ended» не пришёл (вкладка была в фоне) — сообщаем сами
      if (d > 0 && want > d + 2) {
        if (endedRev.current !== s.rev) {
          endedRev.current = s.rev;
          sendRef.current({ t: 'ended', rev: s.rev });
        }
        return;
      }
      if (st !== S.PLAYING && st !== S.BUFFERING) {
        if (st === S.ENDED && want >= d - 1) return;
        p.playVideo();
        if (!playSince.current) playSince.current = Date.now();
        else if (Date.now() - playSince.current > 2500) {
          // не запускается — скорее всего, запрет автозапуска со звуком: включаем без звука
          p.mute();
          setBlocked(true);
        }
      } else playSince.current = 0;
      if (Math.abs(t - want) > DRIFT_PLAYING && Date.now() - lastSeek.current > 2000) {
        p.seekTo(want, true);
        lastSeek.current = Date.now();
      }
    } else {
      playSince.current = 0;
      if (st === S.CUED || st === S.UNSTARTED) {
        // на «заряженном» видео seekTo запустил бы воспроизведение — перезаряжаем с нужной секунды
        if (Math.abs(cuedAt.current - want) > DRIFT_PAUSED) {
          p.cueVideoById({ videoId: s.videoId, startSeconds: want });
          cuedAt.current = want;
        }
        return;
      }
      if (st === S.PLAYING || st === S.BUFFERING) p.pauseVideo();
      if (Math.abs(t - want) > DRIFT_PAUSED && Date.now() - lastSeek.current > 600) {
        p.seekTo(want, true);
        lastSeek.current = Date.now();
      }
    }
  }, [ready, serverNow]);

  // изменение в комнате — сверяемся сразу, не дожидаясь тика
  useEffect(() => {
    lastSeek.current = 0;
    sync();
  }, [player.rev, player.videoId, sync]);

  // тик: подстройка и обновление полосы времени
  useEffect(() => {
    const id = setInterval(() => {
      sync();
      const p = yt.current;
      if (!p || !ready || !loaded.current) {
        setCur(0);
        setDur(0);
        return;
      }
      const s = P.current;
      const st = p.getPlayerState();
      const cued = st === S.CUED || st === S.UNSTARTED;
      setCur(cued ? expectedPos(s, serverNow()) : p.getCurrentTime());
      setDur(p.getDuration() || 0);
      setBuf(p.getVideoLoadedFraction() || 0);
      setWaiting(s.playing && st === S.BUFFERING);
    }, 250);
    return () => clearInterval(id);
  }, [sync, ready, serverNow]);

  // громкость — у каждого своя
  useEffect(() => {
    const p = yt.current;
    if (!p || !ready) return;
    p.setVolume(vol);
    if (muted || blocked) p.mute();
    else p.unMute();
    store.set('vol', String(vol));
    store.set('muted', muted ? '1' : '0');
  }, [vol, muted, blocked, ready]);

  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const localPos = () => {
    const p = yt.current;
    const st = p?.getPlayerState();
    return p && st !== S.CUED && st !== S.UNSTARTED ? p.getCurrentTime() : expectedPos(P.current, serverNow());
  };
  const guard = () => {
    if (!canControl) notify('Управлять плеером может только ведущий или модератор');
    return canControl && !!P.current.videoId;
  };
  const toggle = () => {
    if (!guard()) return;
    send({ t: P.current.playing ? 'pause' : 'play', pos: localPos() });
  };
  const seekTo = (pos: number) => {
    if (!guard()) return;
    send({ t: 'seek', pos: Math.max(0, Math.min(pos, dur || pos)) });
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else box.current?.requestFullscreen?.();
  };
  const unblock = () => {
    setBlocked(false);
    yt.current?.unMute();
    yt.current?.playVideo();
  };
  const resync = () => {
    lastSeek.current = 0;
    const p = yt.current;
    if (p && P.current.videoId) p.seekTo(expectedPos(P.current, serverNow()), true);
  };

  // горячие клавиши, когда фокус не в поле ввода
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' || e.key === 'k' || e.key === 'л') toggle();
    else if (e.key === 'ArrowLeft') seekTo(localPos() - 5);
    else if (e.key === 'ArrowRight') seekTo(localPos() + 5);
    else if (e.key === 'f' || e.key === 'а') toggleFull();
    else if (e.key === 'm' || e.key === 'ь') setMuted((m) => !m);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const shown = scrub ?? cur;
  const pct = dur ? (shown / dur) * 100 : 0;
  const has = !!player.videoId;

  return (
    <div className={full ? 'pl is-full' : 'pl'} ref={box}>
      <div className="pl-screen">
        <div className="pl-yt" ref={host} />
        {/* перехватываем клики по видео: управление только через наши кнопки */}
        <div className="pl-shield" onClick={toggle} onDoubleClick={toggleFull} />
        {!has && (
          <div className="pl-empty">
            <pre className="pl-tv" aria-hidden="true">{TV}</pre>
            <b>Пока ничего не играет</b>
            <span>Вставь ссылку на YouTube в плейлист — видео включится у всех.</span>
          </div>
        )}
        {has && error !== null && (
          <div className="pl-msg">
            <b>{YT_ERRORS[error] ?? `Ошибка плеера (${error})`}</b>
            <button className="btn btn-ghost btn-sm" onClick={() => send({ t: 'skip' })}>
              <Icon name="skip" /> Пропустить
            </button>
          </div>
        )}
        {has && blocked && (
          <button className="pl-unblock px px-raised hov" onClick={unblock}>
            <Icon name="mute" size={18} /> Браузер выключил звук — нажми, чтобы включить
          </button>
        )}
        {has && waiting && !error && <div className="pl-wait" aria-label="Загрузка" />}
      </div>

      <div className="pl-bar">
        <div className="pl-seek" style={{ '--p': `${pct}%`, '--buf': `${buf * 100}%` } as React.CSSProperties}>
          <input
            type="range"
            min={0}
            max={dur || 1}
            step={0.1}
            value={Math.min(shown, dur || 1)}
            disabled={!has || !canControl}
            aria-label="Перемотка"
            onChange={(e) => setScrub(Number(e.target.value))}
            onPointerUp={() => {
              if (scrub !== null) seekTo(scrub);
              setScrub(null);
            }}
            onKeyUp={() => {
              if (scrub !== null) seekTo(scrub);
              setScrub(null);
            }}
          />
        </div>
        <div className="pl-row">
          <button className="pl-btn" onClick={toggle} disabled={!has} aria-label={player.playing ? 'Пауза' : 'Играть'} title={canControl ? 'Пробел' : 'Нет прав'}>
            <Icon name={player.playing ? 'pause' : 'play'} size={18} />
          </button>
          <button
            className="pl-btn"
            onClick={() => send({ t: 'skip' })}
            disabled={!has}
            title={canControl ? 'Следующее видео' : 'Голосовать за пропуск'}
            aria-label="Пропустить"
          >
            <Icon name="next" size={18} />
            {!canControl && skip.votes > 0 && (
              <small>
                {skip.votes}/{skip.need}
              </small>
            )}
          </button>
          <div className="pl-vol">
            <button className="pl-btn" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Включить звук' : 'Выключить звук'} title="M">
              <Icon name={muted || vol === 0 ? 'mute' : 'vol'} size={18} />
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : vol} aria-label="Громкость" onChange={(e) => (setVol(Number(e.target.value)), setMuted(false))} style={{ '--p': `${muted ? 0 : vol}%` } as React.CSSProperties} />
          </div>
          <span className="pl-time">
            {fmtTime(shown)} <i>/</i> {fmtTime(dur)}
          </span>
          <span className="pl-gap" />
          <button className="pl-btn" onClick={resync} disabled={!has} title="Догнать остальных" aria-label="Синхронизировать">
            <Icon name="sync" size={18} />
          </button>
          <select
            className="pl-rate"
            value={player.rate}
            disabled={!has || !canControl}
            onChange={(e) => send({ t: 'rate', rate: Number(e.target.value) })}
            aria-label="Скорость"
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
          <button className="pl-btn" onClick={toggleFull} aria-label="Во весь экран" title="F">
            <Icon name="full" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

const TV = String.raw`   \  /
 ___\/___
|  ____  |
| |    | |
| |____| |
|________|`;
