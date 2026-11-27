// synckal — сервер комнат: HTTP раздаёт собранный фронтенд и /api, WebSocket /ws синхронизирует комнаты.
// Всё хранится в памяти процесса: перезапуск сервера = все комнаты пустые.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

// в разработке (--dev) сервер всегда на 3000: туда смотрит прокси Vite, а PORT из окружения может принадлежать Vite
const PORT = process.argv.includes('--dev') ? 3000 : Number(process.env.PORT) || 3000;
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const ROOM_TTL = 10 * 60_000; // пустая комната живёт 10 минут
const CHAT_KEEP = 150;
const QUEUE_MAX = 300;
const COLORS = ['#b8a7f0', '#e0b64a', '#6fd8f2', '#3fb950', '#f27aa6', '#f2994a', '#9fe870', '#7aa2f7', '#e879f9', '#f24d5c'];

/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<string, number>} распущенные комнаты → когда; код какое-то время не занимаем заново */
const disbanded = new Map();
const DISBAND_TTL = 6 * 60 * 60_000;

const now = () => Date.now();
const uid = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const roomCode = () => {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[crypto.randomInt(abc.length)];
  return rooms.has(s) || disbanded.has(s) ? roomCode() : s;
};
const validRoom = (s) => typeof s === 'string' && /^[a-z0-9-]{3,32}$/.test(s);

/** Достаёт id видео из любой формы ссылки YouTube или голого id. */
export function parseVideoId(input) {
  const s = String(input ?? '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  if (host === 'youtu.be') return u.pathname.slice(1, 12).match(/^[\w-]{11}$/)?.[0] ?? null;
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = u.searchParams.get('v');
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** «1:23», «1m23s», «83» → секунды; параметр t= из ссылки */
function parseStart(input) {
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
    const t = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) : 0;
  } catch {
    return 0;
  }
}

const metaCache = new Map();
/** Название и автор через oEmbed YouTube (без ключа API). Недоступное/приватное видео → null. */
async function videoMeta(id) {
  if (metaCache.has(id)) return metaCache.get(id);
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return r.status === 401 || r.status === 403 || r.status === 404 ? null : { title: id, author: '' };
    const j = await r.json();
    const meta = { title: clip(j.title, 200) || id, author: clip(j.author_name, 100) };
    metaCache.set(id, meta);
    if (metaCache.size > 5000) metaCache.delete(metaCache.keys().next().value);
    return meta;
  } catch {
    return { title: id, author: '' }; // сеть недоступна — всё равно добавляем
  }
}

const infoCache = new Map(); // id → { at, data }
const INFO_TTL = 30 * 60_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Раскадровка из страницы видео. spec: «шаблон|уровень|уровень…», уровень — «w#h#кадров#столбцов#строк#интервал_мс#имя#sigh».
 * Берём самый крупный уровень (обычно 320×180, листы 3×3, кадр каждые 2 с).
 */
export function parseStoryboard(spec) {
  if (!spec) return null;
  const [base, ...levels] = spec.split('|');
  for (let L = levels.length - 1; L >= 0; L--) {
    const [w, h, count, cols, rows, interval, name, sigh] = levels[L].split('#');
    if (!name || !sigh || !+w || !+count) continue;
    return {
      url: base.replace('$L', String(L)).replace('$N', name) + '&sigh=' + sigh, // $M в url — номер листа
      w: +w,
      h: +h,
      count: +count,
      cols: +cols,
      rows: +rows,
      interval: +interval,
    };
  }
  return null;
}

async function watchPage(id) {
  const r = await fetch('https://www.youtube.com/watch?v=' + id + '&hl=ru', {
    headers: { 'user-agent': UA, 'accept-language': 'ru,en;q=0.8', cookie: 'CONSENT=YES+1; SOCS=CAI' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('watch ' + r.status);
  const html = await r.text();
  const spec = html.match(/"playerStoryboardSpecRenderer":\{"spec":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&');
  const chapters = [];
  const seen = new Set();
  for (const m of html.matchAll(/"chapterRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeRangeStartMillis":(\d+)/g)) {
    const t = Number(m[2]) / 1000;
    if (seen.has(t)) continue; // главы на странице повторяются в нескольких блоках
    seen.add(t);
    let title = m[1];
    try {
      title = JSON.parse('"' + m[1] + '"');
    } catch {}
    chapters.push({ t, title: clip(title, 100) });
  }
  chapters.sort((a, b) => a.t - b.t);
  return { storyboard: parseStoryboard(spec), chapters };
}

async function votes(id) {
  // публичных дизлайков у YouTube нет — оценка от Return YouTube Dislike (лайки там настоящие)
  const r = await fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + id, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('votes ' + r.status);
  const j = await r.json();
  return { likes: num(j.likes, null), dislikes: num(j.dislikes, null), views: num(j.viewCount, null) };
}

const SB_CATS = encodeURIComponent(JSON.stringify(['sponsor', 'selfpromo', 'interaction']));
/** рекламные вставки из SponsorBlock: [[начало, конец], …] в секундах, пересекающиеся слиты */
async function sponsorSegments(id) {
  const r = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${id}&categories=${SB_CATS}`, { signal: AbortSignal.timeout(6000) });
  if (r.status === 404) return []; // так SponsorBlock отвечает, когда отрезков нет
  if (!r.ok) throw new Error('sponsorblock ' + r.status);
  const segs = (await r.json())
    .filter((s) => s.actionType === 'skip' && Array.isArray(s.segment))
    .map((s) => [num(s.segment[0], 0), num(s.segment[1], 0)])
    .filter(([a, b]) => b - a >= 1)
    .sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of segs) {
    const last = out.at(-1);
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

async function videoInfo(id) {
  const c = infoCache.get(id);
  if (c && now() - c.at < INFO_TTL) return c.data;
  const [page, v, sb] = await Promise.allSettled([watchPage(id), votes(id), sponsorSegments(id)]);
  const data = {
    storyboard: page.status === 'fulfilled' ? page.value.storyboard : null,
    chapters: page.status === 'fulfilled' ? page.value.chapters : [],
    sponsor: sb.status === 'fulfilled' ? sb.value : [],
    ...(v.status === 'fulfilled' ? v.value : { likes: null, dislikes: null, views: null }),
  };
  infoCache.set(id, { at: now(), data });
  if (infoCache.size > 2000) infoCache.delete(infoCache.keys().next().value);
  return data;
}

class Room {
  constructor(id) {
    this.id = id;
    this.created = now();
    /** @type {Map<string, Member>} uid → участник (по одному на вкладку) */
    this.members = new Map();
    this.creatorCid = null; // кто создал комнату — только он может её распустить
    this.leaderCid = null; // ведущий — по постоянному id клиента, переживает перезагрузку страницы
    this.mods = new Set(); // cid модераторов
    this.banned = new Set(); // cid выгнанных: обратно не пускаем
    this.joinOrder = new Map(); // cid → когда впервые зашёл (для передачи короны)
    // listed — видна в списке на главной; sponsor — пропускать рекламные вставки (SponsorBlock)
    this.settings = { open: true, listed: true, title: '', sponsor: true };
    this.sponsor = null; // { id, segs } — вставки текущего видео, segs = null, пока грузятся
    this.sbTimer = 0;
    this.player = { videoId: null, title: '', author: '', playing: false, pos: 0, at: now(), rate: 1, rev: 0, item: null };
    this.queue = [];
    this.chat = [];
    this.skipVotes = new Set();
    this.emptySince = now();
    this.colorIdx = 0;
  }

  /** ведущий среди подключённых: настоящий, если он тут, иначе самый давний участник */
  leader() {
    const cids = new Set([...this.members.values()].map((m) => m.cid));
    if (this.leaderCid && cids.has(this.leaderCid)) return this.leaderCid;
    let best = null, bestT = Infinity;
    for (const c of cids) {
      const t = this.joinOrder.get(c) ?? Infinity;
      if (t < bestT) (best = c), (bestT = t);
    }
    return best;
  }
  role(cid) {
    if (cid === this.leader()) return 'leader';
    if (this.mods.has(cid)) return 'mod';
    return 'user';
  }
  canControl(cid) {
    return this.settings.open || this.role(cid) !== 'user';
  }
  isStaff(cid) {
    return this.role(cid) !== 'user';
  }

  position() {
    const p = this.player;
    return p.playing ? p.pos + ((now() - p.at) / 1000) * p.rate : p.pos;
  }
  setPlayer(patch) {
    // позицию досчитываем до изменения: смена скорости или паузы не должна сдвигать время
    const pos = patch.pos ?? this.position();
    Object.assign(this.player, patch, { pos: Math.max(0, pos), at: now(), rev: this.player.rev + 1 });
  }
  playItem(item, startAt = 0) {
    this.skipVotes.clear();
    if (!item) {
      this.setPlayer({ videoId: null, title: '', author: '', item: null, playing: false, pos: 0 });
      return;
    }
    this.setPlayer({ videoId: item.videoId, title: item.title, author: item.author, item: item.id, playing: true, pos: startAt || item.start || 0 });
  }
  next() {
    this.playItem(this.queue.shift() ?? null);
  }

  snapshot() {
    const leader = this.leader();
    // несколько вкладок одного человека — одна строка; ids — все его подключения (cid наружу не отдаём)
    const byCid = new Map();
    for (const m of this.members.values()) {
      const u = byCid.get(m.cid);
      if (u) u.ids.push(m.id);
      else
        byCid.set(m.cid, {
          id: m.id,
          ids: [m.id],
          name: m.name,
          color: m.color,
          role: m.cid === leader ? 'leader' : this.mods.has(m.cid) ? 'mod' : 'user',
          ...(m.cid === this.creatorCid ? { creator: true } : {}),
        });
    }
    const users = [...byCid.values()];
    return {
      id: this.id,
      settings: this.settings,
      player: this.player,
      queue: this.queue,
      users,
      skip: { votes: this.skipVotes.size, need: this.skipNeed() },
    };
  }
  skipNeed() {
    const n = new Set([...this.members.values()].map((m) => m.cid)).size;
    return Math.floor(n / 2) + 1;
  }

  send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }
  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const m of this.members.values()) if (m.ws.readyState === 1) m.ws.send(data);
  }
  sync() {
    this.broadcast({ t: 'room', room: this.snapshot(), now: now() });
    this.armSponsor();
  }
  /**
   * Пропуск рекламы у всех сразу: сервер знает позицию по своим часам, поэтому сам ставит таймер
   * на начало ближайшей вставки и перематывает комнату. Если в вставку перемотали вручную
   * (и уже смотрят дольше секунды) — её не трогаем, ждём следующую.
   */
  armSponsor() {
    clearTimeout(this.sbTimer);
    const p = this.player;
    if (!this.settings.sponsor || !p.videoId || !p.playing) return;
    if (this.sponsor?.id !== p.videoId) {
      const id = p.videoId;
      this.sponsor = { id, segs: null };
      videoInfo(id).then((info) => {
        if (this.sponsor?.id !== id) return;
        this.sponsor.segs = info.sponsor;
        this.armSponsor();
      });
      return;
    }
    const segs = this.sponsor.segs;
    if (!segs) return;
    const pos = this.position();
    const seg = segs.find(([a, b]) => a > pos - 1 && b > pos + 0.5);
    if (!seg) return;
    const rev = p.rev;
    this.sbTimer = setTimeout(() => {
      if (!rooms.has(this.id) || this.player.rev !== rev) return;
      this.setPlayer({ pos: seg[1] });
      this.say(`Пропущена реклама ${mmss(seg[0])}–${mmss(seg[1])} (SponsorBlock)`);
      this.sync();
    }, Math.max(0, ((seg[0] - pos) / p.rate) * 1000));
  }
  say(text, from) {
    const msg = { id: uid(10), ts: now(), text, ...(from ? { uid: from.id, name: from.name, color: from.color } : { sys: true }) };
    this.chat.push(msg);
    if (this.chat.length > CHAT_KEEP) this.chat.splice(0, this.chat.length - CHAT_KEEP);
    this.broadcast({ t: 'chat', msg });
  }
}

/** @typedef {{ id: string, cid: string, name: string, color: string, ws: import('ws').WebSocket, room: Room }} Member */

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) rooms.set(id, (r = new Room(id)));
  return r;
}

// ───────── обработка сообщений ─────────

const handlers = {
  async add(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    const videoId = parseVideoId(d.url);
    if (!videoId) return room.send(m.ws, { t: 'error', text: 'Не похоже на ссылку YouTube' });
    if (room.queue.length >= QUEUE_MAX) return room.send(m.ws, { t: 'error', text: 'Плейлист переполнен' });
    const meta = await videoMeta(videoId);
    if (!meta) return room.send(m.ws, { t: 'error', text: 'Видео недоступно или приватное' });
    if (!rooms.has(room.id)) return;
    const item = { id: uid(10), videoId, title: meta.title, author: meta.author, by: m.name, start: parseStart(d.url) };
    if (d.mode === 'now' || !room.player.videoId) {
      room.playItem(item);
      room.say(`${m.name} включает «${item.title}»`);
    } else {
      if (d.mode === 'next') room.queue.unshift(item);
      else room.queue.push(item);
      room.say(`${m.name} добавляет «${item.title}»${d.mode === 'next' ? ' следующим' : ''}`);
    }
    room.sync();
  },
  remove(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    room.queue = room.queue.filter((it) => it.id !== d.id);
    room.sync();
  },
  move(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    const i = room.queue.findIndex((it) => it.id === d.id);
    if (i < 0) return;
    const to = Math.max(0, Math.min(room.queue.length - 1, Number(d.to) | 0));
    const [it] = room.queue.splice(i, 1);
    room.queue.splice(to, 0, it);
    room.sync();
  },
  shuffle(room, m) {
    if (!room.canControl(m.cid)) return deny(m);
    const q = room.queue;
    for (let i = q.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [q[i], q[j]] = [q[j], q[i]];
    }
    room.sync();
  },
  clear(room, m) {
    if (!room.canControl(m.cid)) return deny(m);
    room.queue = [];
    room.say(`${m.name} очищает плейлист`);
    room.sync();
  },
  playItem(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    const i = room.queue.findIndex((it) => it.id === d.id);
    if (i < 0) return;
    const [it] = room.queue.splice(i, 1);
    room.playItem(it);
    room.say(`${m.name} включает «${it.title}»`);
    room.sync();
  },
  skip(room, m) {
    if (!room.player.videoId) return;
    if (room.canControl(m.cid)) {
      room.say(`${m.name} пропускает видео`);
      room.next();
      return room.sync();
    }
    // без прав — голос за пропуск
    if (room.skipVotes.has(m.cid)) return;
    room.skipVotes.add(m.cid);
    if (room.skipVotes.size >= room.skipNeed()) {
      room.say('Большинство проголосовало — видео пропущено');
      room.next();
    } else room.say(`${m.name} голосует за пропуск (${room.skipVotes.size}/${room.skipNeed()})`);
    room.sync();
  },
  ended(room, m, d) {
    // первый, у кого видео закончилось, переключает; остальные «ended» по тому же rev игнорируются.
    // В закрытой комнате слушаем только ведущего и модераторов, иначе это пропуск в обход голосования
    if (!room.canControl(m.cid)) return;
    if (d.rev !== room.player.rev || !room.player.videoId) return;
    room.next();
    room.sync();
  },
  play(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    if (!room.player.videoId) return;
    room.setPlayer({ playing: true, pos: num(d.pos, room.position()) });
    room.sync();
  },
  pause(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    room.setPlayer({ playing: false, pos: num(d.pos, room.position()) });
    room.sync();
  },
  seek(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    room.setPlayer({ pos: num(d.pos, 0) });
    room.sync();
  },
  rate(room, m, d) {
    if (!room.canControl(m.cid)) return deny(m);
    const rate = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(d.rate) ? d.rate : 1;
    room.setPlayer({ rate });
    room.sync();
  },
  chat(room, m, d) {
    const text = clip(d.text, 500);
    if (!text) return;
    if (now() - (m.lastChat ?? 0) < 350) return; // антифлуд
    m.lastChat = now();
    room.say(text, m);
  },
  name(room, m, d) {
    const name = clip(d.name, 24);
    if (!name || name === m.name) return;
    if (now() - (m.lastChat ?? 0) < 350) return; // тот же антифлуд, что у чата: смена ника пишет в чат
    m.lastChat = now();
    room.say(`${m.name} теперь ${name}`);
    for (const x of room.members.values()) if (x.cid === m.cid) x.name = name;
    room.sync();
  },
  settings(room, m, d) {
    if (room.role(m.cid) !== 'leader') return deny(m);
    if (typeof d.open === 'boolean') room.settings.open = d.open;
    if (typeof d.listed === 'boolean') room.settings.listed = d.listed;
    if (typeof d.sponsor === 'boolean') room.settings.sponsor = d.sponsor;
    if (typeof d.title === 'string') room.settings.title = clip(d.title, 48);
    room.sync();
  },
  promote(room, m, d) {
    // ведущий: mod — назначить/снять модератора, leader — передать корону
    if (room.role(m.cid) !== 'leader') return deny(m);
    const target = room.members.get(d.uid);
    if (!target || target.cid === m.cid) return;
    if (d.role === 'leader') {
      room.leaderCid = target.cid;
      room.mods.add(m.cid);
      room.mods.delete(target.cid);
      room.say(`${m.name} передаёт корону: ${target.name}`);
    } else if (d.role === 'mod') {
      room.mods.add(target.cid);
      room.say(`${target.name} теперь модератор`);
    } else {
      room.mods.delete(target.cid);
      room.say(`${target.name} больше не модератор`);
    }
    room.sync();
  },
  disband(room, m) {
    if (m.cid !== room.creatorCid) return room.send(m.ws, { t: 'error', text: 'Распустить комнату может только её создатель' });
    rooms.delete(room.id);
    disbanded.set(room.id, now());
    for (const x of room.members.values()) {
      room.send(x.ws, { t: 'disbanded' });
      x.ws.close(4002, 'disbanded');
    }
    room.members.clear();
  },
  kick(room, m, d) {
    if (!room.isStaff(m.cid)) return deny(m);
    const target = room.members.get(d.uid);
    if (!target || target.cid === m.cid) return;
    // модератор может выгнать только обычного участника, ведущий — любого
    if (room.role(target.cid) === 'leader' || (room.role(m.cid) !== 'leader' && room.role(target.cid) !== 'user')) return deny(m);
    room.banned.add(target.cid);
    room.mods.delete(target.cid);
    for (const x of room.members.values()) {
      if (x.cid !== target.cid) continue;
      room.send(x.ws, { t: 'kicked' });
      x.ws.close(4001, 'kicked');
    }
    room.say(`${m.name} выгоняет ${target.name}`);
  },
};

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : def);
const deny = (m) => m.room.send(m.ws, { t: 'error', text: 'Это может только ведущий или модератор' });

// ───────── HTTP ─────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webp': 'image/webp',
};

// плеер — iframe API YouTube, обложки и раскадровки — i.ytimg.com; frame-ancestors запрещает встраивать сайт в чужой iframe
const CSP =
  "default-src 'self'; script-src 'self' https://www.youtube.com; frame-src https://www.youtube.com; img-src 'self' data: https://i.ytimg.com; " +
  "style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const plural = (n, one, few, many) => {
  const d = n % 10, h = n % 100;
  return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
};

/** Превью ссылки /r/<код> в мессенджерах: название комнаты, что играет, сколько внутри, обложка видео. */
function roomPreview(html, id) {
  const r = rooms.get(id);
  const title = (r?.settings.title || `Комната ${id}`) + ' · synckal';
  let desc = 'Заходи — смотрим YouTube вместе. Пауза и перемотка у всех сразу.';
  if (r?.player.videoId) {
    const n = new Set([...r.members.values()].map((m) => m.cid)).size;
    desc = `Сейчас: «${r.player.title}»` + (n ? ` · ${n} ${plural(n, 'человек смотрит', 'человека смотрят', 'человек смотрят')}` : '') + '. Заходи!';
  }
  const tags = `<meta property="og:url" content="https://divan.watch/r/${id}" />` +
    (r?.player.videoId
      ? `<meta property="og:image" content="https://i.ytimg.com/vi/${r.player.videoId}/hqdefault.jpg" /><meta name="twitter:card" content="summary_large_image" />`
      : '');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace('</head>', tags + '</head>');
}

const server = http.createServer((req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('strict-transport-security', 'max-age=31536000');
  res.setHeader('content-security-policy', CSP);
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/new' && req.method === 'POST') return json(res, 200, { room: roomCode() });
  if (url.pathname === '/api/rooms') {
    // список комнат для главной (и проверка здоровья на Render): кто внутри, что играет
    const list = [...rooms.values()]
      .filter((r) => r.settings.listed && r.members.size > 0)
      .map((r) => {
        const users = r.snapshot().users.map((u) => ({ name: u.name, color: u.color, role: u.role }));
        return {
          id: r.id,
          title: r.settings.title,
          users,
          videoId: r.player.videoId,
          video: r.player.title,
          author: r.player.author,
          playing: r.player.playing,
          queue: r.queue.length,
        };
      })
      .sort((a, b) => b.users.length - a.users.length || Number(!!b.videoId) - Number(!!a.videoId))
      .slice(0, 48);
    return json(res, 200, { rooms: list, online: list.reduce((n, r) => n + r.users.length, 0) });
  }
  const vi = url.pathname.match(/^\/api\/video\/([\w-]{11})$/);
  if (vi) {
    videoInfo(vi[1]).then(
      (data) => json(res, 200, data),
      () => json(res, 502, { error: 'youtube unavailable' }),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });

  // статика из dist/, всё остальное — index.html (маршруты SPA)
  let file;
  try {
    file = path.join(DIST, decodeURIComponent(url.pathname));
  } catch {
    return json(res, 400, { error: 'bad path' });
  }
  if (!file.startsWith(DIST)) return json(res, 400, { error: 'bad path' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) file = path.join(DIST, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Фронтенд не собран: npm run build (или npm run dev для разработки)');
      }
      const ext = path.extname(file);
      const rm = ext === '.html' && url.pathname.match(/^\/r\/([a-z0-9-]{3,32})\/?$/);
      if (rm) data = roomPreview(data.toString(), rm[1]);
      res.writeHead(200, {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      res.end(data);
    });
  });
});

// ───────── WebSocket ─────────

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  /** @type {Member | null} */
  let me = null;
  ws.isAlive = true;
  ws.on('error', () => {}); // битый или слишком большой кадр: ws закроет только это соединение, без обработчика падает весь процесс
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', async (raw) => {
    let d;
    try {
      d = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!d || typeof d.t !== 'string') return;
    if (d.t === 'ping') return ws.send(JSON.stringify({ t: 'pong', c: d.c, s: now() }));

    if (d.t === 'join') {
      if (me || !validRoom(d.room)) return;
      if (disbanded.has(d.room)) {
        ws.send(JSON.stringify({ t: 'disbanded' }));
        return ws.close(4002, 'disbanded');
      }
      const room = getRoom(d.room);
      const cid = clip(d.cid, 40) || uid(12);
      if (room.banned.has(cid)) {
        room.send(ws, { t: 'kicked' });
        return ws.close(4001, 'kicked');
      }
      const fresh = !room.joinOrder.has(cid);
      if (fresh) room.joinOrder.set(cid, now());
      if (!room.leaderCid) room.leaderCid = room.creatorCid = cid; // создатель комнаты — ведущий
      const sameCid = [...room.members.values()].find((x) => x.cid === cid);
      me = { id: uid(10), cid, name: clip(d.name, 24) || 'Гость', color: sameCid?.color ?? COLORS[room.colorIdx++ % COLORS.length], ws, room };
      room.members.set(me.id, me);
      room.emptySince = 0;
      room.send(ws, { t: 'welcome', you: me.id, room: room.snapshot(), chat: room.chat, now: now() });
      if (!sameCid) room.say(`${me.name} заходит в комнату`);
      room.sync();
      return;
    }
    if (!me) return;
    const h = Object.hasOwn(handlers, d.t) ? handlers[d.t] : null;
    if (h) {
      try {
        await h(me.room, me, d);
      } catch (e) {
        console.error('handler', d.t, e);
      }
    }
  });

  ws.on('close', () => {
    if (!me) return;
    const room = me.room;
    if (!room.members.delete(me.id)) return; // комнату распустили — участников уже нет
    const stillHere = [...room.members.values()].some((x) => x.cid === me.cid);
    if (!stillHere) {
      room.skipVotes.delete(me.cid);
      room.say(`${me.name} выходит`);
    }
    if (room.members.size === 0) {
      room.emptySince = now();
      // никого нет — ставим на паузу, чтобы вернувшиеся продолжили с того же места
      if (room.player.playing) room.setPlayer({ playing: false });
    }
    room.sync();
  });
});

// пинг соединений и уборка пустых комнат
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  for (const [id, t] of disbanded) if (now() - t > DISBAND_TTL) disbanded.delete(id);
  for (const [id, r] of rooms) if (r.members.size === 0 && r.emptySince && now() - r.emptySince > ROOM_TTL) rooms.delete(id);
}, 30_000);

// бесплатный Render усыпляет сервис через 15 минут без входящих запросов, и первый заход потом грузится ~50 с.
// Стучимся сами к себе через внешний адрес (он идёт через балансировщик Render и считается заходом)
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL + '/api/rooms', { signal: AbortSignal.timeout(10_000) }).catch(() => {}), 10 * 60_000);
}

server.listen(PORT,() => console.log(`synckal: http://localhost:${PORT}`));
