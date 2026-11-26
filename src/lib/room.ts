import { useCallback, useEffect, useRef, useState } from 'react';
import { clientId } from './util.ts';

export type Role = 'leader' | 'mod' | 'user';

export interface PlayerState {
  videoId: string | null;
  title: string;
  author: string;
  playing: boolean;
  pos: number; // позиция в момент at (секунды)
  at: number; // серверное время, мс
  rate: number;
  rev: number;
  item: string | null;
}
export interface QueueItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  by: string;
  start: number;
}
export interface User {
  id: string;
  ids: string[]; // все вкладки этого человека
  name: string;
  color: string;
  role: Role;
}
export interface RoomState {
  id: string;
  settings: { open: boolean; title: string };
  player: PlayerState;
  queue: QueueItem[];
  users: User[];
  skip: { votes: number; need: number };
}
export interface ChatMsg {
  id: string;
  ts: number;
  text: string;
  sys?: boolean;
  uid?: string;
  name?: string;
  color?: string;
}

export type Status = 'connecting' | 'open' | 'reconnecting' | 'kicked';

/** Позиция плеера сейчас — по серверным часам. */
export function expectedPos(p: PlayerState, serverNow: number) {
  return p.playing ? p.pos + ((serverNow - p.at) / 1000) * p.rate : p.pos;
}

/**
 * Подключение к комнате: WebSocket с автопереподключением и сверкой часов.
 * offset — на сколько серверные часы впереди наших; serverNow() = Date.now() + offset.
 */
export function useRoom(roomId: string, name: string | null) {
  const [status, setStatus] = useState<Status>('connecting');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [you, setYou] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const offset = useRef(0);
  const bestRtt = useRef(Infinity);
  const nameRef = useRef(name);
  nameRef.current = name;

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const send = useCallback((msg: Record<string, unknown>) => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg));
  }, []);
  const notify = useCallback((text: string) => setToast((t) => ({ text, n: (t?.n ?? 0) + 1 })), []);

  const hasName = !!name;
  useEffect(() => {
    if (!hasName) return;
    let closed = false;
    let retry = 0;
    let timer = 0;
    let pinger = 0;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const sock = new WebSocket(`${proto}://${location.host}/ws`);
      ws.current = sock;

      const ping = () => sock.readyState === WebSocket.OPEN && sock.send(JSON.stringify({ t: 'ping', c: Date.now() }));
      sock.onopen = () => {
        retry = 0;
        bestRtt.current = Infinity;
        sock.send(JSON.stringify({ t: 'join', room: roomId, name: nameRef.current, cid: clientId() }));
        // пачка пингов при входе, потом — редко: берём замер с самым коротким откликом
        for (let i = 0; i < 6; i++) setTimeout(ping, i * 150);
        pinger = window.setInterval(ping, 15000);
      };
      sock.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        switch (d.t) {
          case 'pong': {
            const t = Date.now();
            const rtt = t - d.c;
            // старые лучшие замеры понемногу «стареют», чтобы часы подстраивались под смену сети
            bestRtt.current *= 1.1;
            if (rtt <= bestRtt.current) {
              bestRtt.current = rtt;
              offset.current = d.s - (d.c + rtt / 2);
            }
            break;
          }
          case 'welcome':
            setYou(d.you);
            setRoom(d.room);
            setChat(d.chat);
            setStatus('open');
            break;
          case 'room':
            setRoom(d.room);
            break;
          case 'chat':
            setChat((c) => (c.length > 200 ? [...c.slice(-150), d.msg] : [...c, d.msg]));
            break;
          case 'error':
            notify(d.text);
            break;
          case 'kicked':
            closed = true;
            setStatus('kicked');
            break;
        }
      };
      sock.onclose = () => {
        clearInterval(pinger);
        if (closed) return;
        setStatus('reconnecting');
        timer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      clearInterval(pinger);
      ws.current?.close();
      ws.current = null;
    };
  }, [roomId, hasName, notify]);

  // смена ника без переподключения
  useEffect(() => {
    if (name && status === 'open') send({ t: 'name', name });
  }, [name, status, send]);

  return { status, room, chat, you, send, serverNow, toast, notify };
}
