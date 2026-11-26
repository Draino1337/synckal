import { useCallback, useEffect, useRef, useState } from 'react';
import { expectedPos, type PlayerState } from '../lib/room.ts';
import { loadYT, S, YT_ERRORS } from '../lib/youtube.ts';
import { fmtTime, store } from '../lib/util.ts';
import { Icon } from './Icon.tsx';
import { storyFrame, type VideoInfo } from '../lib/videoInfo.ts';
import { QualityMenu, frameGeometry, qLabel, type Quality } from './Quality.tsx';

interface Props {
  player: PlayerState;
  serverNow: () => number;
  canControl: boolean;
  send: (m: Record<string, unknown>) => void;
  skip: { votes: number; need: number };
  notify: (text: string) => void;
  info: VideoInfo | null;
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DRIFT_PLAYING = 1; // с — больше этого отставания при воспроизведении подматываем
const DRIFT_PAUSED = 0.4;

/**
 * Плеер YouTube без родных кнопок: управление своё, чтобы любое действие уходило на сервер
 * и не путалось с подстройкой. Раз в 250 мс сверяем плеер с состоянием комнаты:
 * то ли видео, играет/пауза, скорость, позиция (с поправкой на серверные часы).
 */
export function Player({ player, serverNow, canControl, send, skip, notify, info }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
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
  const seekEl = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null); // где мышь над дорожкой (px от левого края)
  const [vol, setVol] = useState(() => Number(store.get('vol') ?? 80));
  const [muted, setMuted] = useState(() => store.get('muted') === '1');
  const [full, setFull] = useState(false);
  // субтитры по умолчанию выключены: YouTube сам включает их по настройкам аккаунта/браузера
  const [cc, setCc] = useState(() => store.get('cc') === '1');
  const ccRef = useRef(cc);
  ccRef.current = cc;
  const [ytState, setYtState] = useState<number>(S.UNSTARTED);
  // качество: YouTube выбирает его по размеру плеера (setPlaybackQuality давно не работает),
  // поэтому рисуем плеер в нужном разрешении и масштабируем под экран
  const [quality, setQuality] = useState<Quality>(() => {
    const q = store.get('q');
    return q === 'large' || q === 'hd720' || q === 'hd1080' || q === 'hd1440' || q === 'hd2160' ? q : 'auto';
  });
  const [levels, setLevels] = useState<string[]>([]);
  const [actual, setActual] = useState('');
  const [flash, setFlash] = useState(0); // крупная надпись с новым качеством поверх видео
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = screen.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** включает/выключает модуль субтитров; YouTube грузит его заново с каждым видео, поэтому зовём часто */
  const applyCc = useCallback(() => {
    const p = yt.current;
    if (!p) return;
    try {
      if (ccRef.current) p.loadModule('captions');
      else {
        p.unloadModule('captions');
        p.unloadModule('cc');
      }
    } catch {
      /* модуль ещё не готов — повторим на следующем событии */
    }
  }, []);

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
        playerVars: {
          controls: 0,
          disablekb: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          fs: 0,
          modestbranding: 1,
          cc_load_policy: ccRef.current ? 1 : 0,
          origin: location.origin,
        },
        events: {
          onReady: () => !dead && setReady(true),
          // модуль субтитров подгрузился — сразу применяем выбор
          onApiChange: () => applyCc(),
          onStateChange: (e: YT.PlayerEvent) => {
            setYtState(e.data);
            if (e.data === S.PLAYING) {
              const lv = e.target.getAvailableQualityLevels?.() ?? [];
              setLevels(lv.filter((q) => q !== 'auto'));
              fail(null);
              applyCc();
              applyVol(); // новое видео может прийти со своей громкостью
            }
            if (e.data === S.ENDED) {
              const s = P.current;
              if (s.playing && endedRev.current !== s.rev) {
                endedRev.current = s.rev;
                sendRef.current({ t: 'ended', rev: s.rev });
              }
            }
          },
          onPlaybackQualityChange: (e: { data: string }) => setActual(e.data),
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
      setYtState(st);
      const q = p.getPlaybackQuality?.();
      if (q && q !== 'unknown') setActual(q);
    }, 250);
    return () => clearInterval(id);
  }, [sync, ready, serverNow]);

  // громкость — у каждого своя. Ползунок на нуле = без звука: setVolume(0) YouTube соблюдает не всегда
  const volRef = useRef({ vol, silent: muted || blocked || vol === 0 });
  volRef.current = { vol, silent: muted || blocked || vol === 0 };
  const applyVol = useCallback(() => {
    const p = yt.current;
    if (!p) return;
    const { vol: v, silent } = volRef.current;
    p.setVolume(v);
    if (silent) p.mute();
    else p.unMute();
  }, []);
  useEffect(() => {
    if (!ready) return;
    applyVol();
    store.set('vol', String(vol));
    store.set('muted', muted ? '1' : '0');
  }, [vol, muted, blocked, ready, applyVol]);

  useEffect(() => {
    store.set('q', quality);
  }, [quality]);

  useEffect(() => {
    store.set('cc', cc ? '1' : '0');
    if (ready) applyCc();
  }, [cc, ready, applyCc]);

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
  const toggleMute = () => {
    if (vol === 0) {
      setVol(50);
      setMuted(false);
    } else setMuted((m) => !m);
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
    // пробел на кнопке или ссылке нажимает её саму — иначе вышло бы два действия сразу
    if (e.key === ' ' && (tag === 'BUTTON' || tag === 'A')) return;
    if (e.key === ' ' || e.key === 'k' || e.key === 'л') toggle();
    else if (e.key === 'c' || e.key === 'с') setCc((v) => !v);
    else if (e.key === 'ArrowLeft') seekTo(localPos() - 5);
    else if (e.key === 'ArrowRight') seekTo(localPos() + 5);
    else if (e.key === 'f' || e.key === 'а') toggleFull();
    else if (e.key === 'm' || e.key === 'ь') toggleMute();
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // одиночный клик по видео — пауза, двойной — весь экран. Клик ждёт 250 мс, чтобы двойной не ставил паузу дважды
  const clickTimer = useRef(0);
  const shieldClick = () => {
    clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(toggle, 250);
  };
  const shieldDouble = () => {
    clearTimeout(clickTimer.current);
    toggleFull();
  };
  useEffect(() => () => clearTimeout(clickTimer.current), []);

  const ytHref = player.videoId ? `https://www.youtube.com/watch?v=${player.videoId}&t=${Math.floor(cur)}s` : undefined;
  const shown = scrub ?? cur;
  const pct = dur ? (shown / dur) * 100 : 0;
  const has = !!player.videoId;
  const geo = frameGeometry(size, quality);
  const poster = !ready || ytState === S.CUED || ytState === S.UNSTARTED || ytState === S.ENDED;

  return (
    <div className={full ? 'pl is-full' : 'pl'} ref={box}>
      <div className="pl-screen" ref={screen}>
        <div
          className="pl-yt"
          ref={host}
          style={{ width: geo.w, height: geo.h, transform: `translateY(${-geo.m * geo.s}px) scale(${geo.s})` }}
        />
        {/* вместо заставки YouTube с красной кнопкой и концовки с рекомендациями — своя обложка */}
        {has && poster && error === null && (
          <div className="pl-poster">
            <Poster id={player.videoId!} />
            <span className="pl-poster-tag px px-raised">
              <Icon name={player.playing ? 'tv' : 'pause'} size={14} />
              {player.playing ? 'Загружаем…' : `Пауза · ${fmtTime(cur)}`}
            </span>
          </div>
        )}
        {/* перехватываем клики по видео: управление только через наши кнопки */}
        <div className="pl-shield" onClick={shieldClick} onDoubleClick={shieldDouble} />
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
        {flash > 0 && (
          <div key={flash} className="pl-qflash" aria-hidden="true">
            {qLabel(quality)}
          </div>
        )}
      </div>

      <div className="pl-bar">
        <div
          className="pl-seek"
          ref={seekEl}
          style={{ '--p': `${pct}%`, '--buf': `${buf * 100}%` } as React.CSSProperties}
          onPointerMove={(e) => setHoverX(e.clientX - e.currentTarget.getBoundingClientRect().left)}
          onPointerLeave={() => setHoverX(null)}
        >
          {has && dur > 0 && info?.chapters.map((c) => c.t > 0 && c.t < dur && <i key={c.t} className="pl-chap" style={{ left: `${(c.t / dur) * 100}%` }} />)}
          {has && dur > 0 && (hoverX !== null || scrub !== null) && (
            <SeekPreview width={seekEl.current?.clientWidth ?? 0} x={hoverX} t={scrub} dur={dur} info={info} />
          )}
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
            <button className="pl-btn" onClick={toggleMute} aria-label={muted || vol === 0 ? 'Включить звук' : 'Выключить звук'} title="M">
              <Icon name={muted || vol === 0 ? 'mute' : 'vol'} size={18} />
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : vol} aria-label="Громкость" onChange={(e) => (setVol(Number(e.target.value)), setMuted(false))} style={{ '--p': `${muted ? 0 : vol}%` } as React.CSSProperties} />
          </div>
          <span className="pl-time">
            {fmtTime(shown)} <i>/</i> {fmtTime(dur)}
          </span>
          <span className="pl-gap" />
          <button
            className={cc ? 'pl-btn pl-cc is-on' : 'pl-btn pl-cc'}
            onClick={() => setCc((v) => !v)}
            disabled={!has}
            aria-pressed={cc}
            aria-label={cc ? 'Выключить субтитры' : 'Включить субтитры'}
            title="Субтитры (C)"
          >
            CC
          </button>
          {ytHref ? (
            <a className="pl-btn pl-ytl" href={ytHref} target="_blank" rel="noreferrer" title="Открыть на YouTube" aria-label="Открыть на YouTube">
              <Icon name="yt" size={18} />
            </a>
          ) : (
            <button className="pl-btn pl-ytl" disabled aria-label="Открыть на YouTube">
              <Icon name="yt" size={18} />
            </button>
          )}
          <QualityMenu quality={quality} levels={levels} actual={actual} disabled={!has} onPick={(q) => (setQuality(q), setFlash((n) => n + 1))} />
          <button className="pl-btn pl-sync" onClick={resync} disabled={!has} title="Догнать остальных" aria-label="Синхронизировать">
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

/** Карточка над дорожкой: кадр из раскадровки YouTube, время и глава. */
function SeekPreview({ width, x, t, dur, info }: { width: number; x: number | null; t: number | null; dur: number; info: VideoInfo | null }) {
  if (!width) return null;
  // при перетаскивании показываем точку, куда тянут, иначе — под мышью
  const at = t ?? Math.max(0, Math.min(1, (x ?? 0) / width)) * dur;
  const sb = info?.storyboard;
  const W = sb ? 192 : 0;
  const card = Math.max(W, 96);
  const left = Math.max(0, Math.min(width - card, (at / dur) * width - card / 2));
  const chapter = info?.chapters.filter((c) => c.t <= at).pop()?.title;
  const f = sb && storyFrame(sb, at, dur);
  const k = sb ? W / sb.w : 1;
  return (
    <div className="pl-pv" style={{ left, width: card }} aria-hidden="true">
      {sb && f && (
        <div
          className="pl-pv-shot"
          style={{
            width: W,
            height: Math.round(sb.h * k),
            backgroundImage: `url("${f.url}")`,
            backgroundSize: `${sb.cols * sb.w * k}px auto`,
            backgroundPosition: `-${f.x * k}px -${f.y * k}px`,
          }}
        />
      )}
      <div className="pl-pv-cap">
        <b>{fmtTime(at)}</b>
        {chapter && <span>{chapter}</span>}
      </div>
    </div>
  );
}

/** Обложка видео: maxres, а если её нет (YouTube отдаёт заглушку 120×90) — hq */
function Poster({ id }: { id: string }) {
  const [hq, setHq] = useState(false);
  useEffect(() => setHq(false), [id]);
  return (
    <img
      src={`https://i.ytimg.com/vi/${id}/${hq ? 'hqdefault' : 'maxresdefault'}.jpg`}
      alt=""
      onLoad={(e) => !hq && e.currentTarget.naturalWidth <= 120 && setHq(true)}
      onError={() => setHq(true)}
    />
  );
}

const TV = String.raw`   \  /
 ___\/___
|  ____  |
| |    | |
| |____| |
|________|`;
