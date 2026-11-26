import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoom } from '../lib/room.ts';
import { randomName, store } from '../lib/util.ts';
import { link } from '../router.ts';
import { Player } from '../components/Player.tsx';
import { Queue, QueueAdd } from '../components/Queue.tsx';
import { Chat } from '../components/Chat.tsx';
import { Users } from '../components/Users.tsx';
import { Icon } from '../components/Icon.tsx';
import { useVideoInfo } from '../lib/videoInfo.ts';
import { Votes } from '../components/Votes.tsx';

function NameModal({ initial, onDone, onCancel }: { initial: string; onDone: (n: string) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial);
  // в портал: у .page есть transform, и position: fixed внутри неё считался бы от страницы, а не от окна
  return createPortal(
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="nm-h">
      <form
        className="modal-box px px-raised"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().slice(0, 24);
          if (n) onDone(n);
        }}
      >
        <h2 id="nm-h">Как тебя зовут?</h2>
        <p>Ник увидят остальные в комнате. Его можно поменять потом.</p>
        <label className="q-field px px-well">
          <Icon name="user" />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Ник" />
        </label>
        <div className="modal-acts">
          <button className="btn btn-primary" disabled={!name.trim()}>
            Войти <Icon name="arrow" size={14} />
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function Room({ id }: { id: string }) {
  const [name, setName] = useState<string | null>(() => store.get('name'));
  const [renaming, setRenaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const { status, room, chat, you, send, serverNow, toast, notify } = useRoom(id, name);
  const info = useVideoInfo(room?.player.videoId ?? null);
  const [toastOn, setToastOn] = useState(false);
  // чат и очередь — вкладки одной панели; пока открыта очередь, считаем непрочитанные сообщения
  const [tab, setTab] = useState<'chat' | 'queue'>('chat');
  const [seen, setSeen] = useState(0);
  const said = chat.filter((m) => !m.sys).length;
  useEffect(() => {
    if (tab === 'chat') setSeen(said);
  }, [tab, said]);
  const unread = tab === 'queue' ? Math.max(0, said - seen) : 0;

  useEffect(() => {
    if (!toast) return;
    setToastOn(true);
    const t = setTimeout(() => setToastOn(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = room?.player.title;
    document.title = (t ? `▶ ${t} · ` : '') + (room?.settings.title || `Комната ${id}`) + ' · synckal';
    return () => {
      document.title = 'synckal — смотрим YouTube вместе';
    };
  }, [room?.player.title, room?.settings.title, id]);

  const saveName = (n: string) => {
    store.set('name', n);
    setName(n);
    setRenaming(false);
  };

  const copy = async () => {
    const link = location.origin + '/r/' + id;
    let ok = false;
    try {
      await navigator.clipboard.writeText(link);
      ok = true;
    } catch {
      // Clipboard API недоступен (нет https, фокуса или разрешения) — старый способ через скрытое поле
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.append(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {}
      ta.remove();
    }
    if (!ok) return void prompt('Скопируй ссылку:', link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!name) return <NameModal initial={randomName()} onDone={saveName} />;

  if (status === 'disbanded')
    return (
      <div className="wrap lost">
        <h1>Комнату распустили</h1>
        <p>Создатель закрыл эту комнату. Можно создать свою — это один клик.</p>
        <a className="btn btn-primary" href="/" onClick={link}>
          На главную
        </a>
      </div>
    );

  if (status === 'kicked')
    return (
      <div className="wrap lost">
        <h1>Тебя выгнали из комнаты</h1>
        <p>Ведущий или модератор убрал тебя из этой комнаты.</p>
        <a className="btn btn-primary" href="/" onClick={link}>
          На главную
        </a>
      </div>
    );

  if (!room)
    return (
      <div className="wrap lost">
        <p className="loading">
          Подключаемся к комнате<i className="caret" />
        </p>
      </div>
    );

  const me = room.users.find((u) => !!you && u.ids.includes(you));
  const myRole = me?.role ?? 'user';
  const canControl = room.settings.open || myRole !== 'user';

  return (
    <div className="room">
      <div className="room-grid">
        <div className="room-main">
          <div className="room-play">
            <QueueAdd hasVideo={!!room.player.videoId} canControl={canControl} send={send} />
            <div className="room-stage">
              <Player player={room.player} serverNow={serverNow} canControl={canControl} send={send} skip={room.skip} notify={notify} info={info} />
              {status === 'reconnecting' && <span className="room-warn px px-raised">Связь потеряна, переподключаемся…</span>}
            </div>
            <div className="now">
              {room.player.videoId ? (
                <>
                  <h2 className="now-title" title={room.player.title}>
                    {room.player.title}
                  </h2>
                  <div className="now-meta">
                    {room.player.author && <small>{room.player.author}</small>}
                    <Votes info={info} />
                  </div>
                </>
              ) : (
                <span className="label">Ничего не играет</span>
              )}
            </div>
          </div>
        </div>
        <aside className="room-side">
          <Users room={room} you={you} myRole={myRole} send={send} onRename={() => setRenaming(true)} onInvite={copy} copied={copied} />
          <section className="feed px">
            <div className="feed-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'feed-tab is-on' : 'feed-tab'} onClick={() => setTab('chat')}>
                <Icon name="chat" size={14} /> Чат
                {unread > 0 && <b className="feed-badge">{unread > 99 ? '99+' : unread}</b>}
              </button>
              <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'feed-tab is-on' : 'feed-tab'} onClick={() => setTab('queue')}>
                <Icon name="list" size={14} /> Очередь
                <em>{room.queue.length}</em>
              </button>
            </div>
            {/* обе вкладки держим смонтированными: не теряются прокрутка и недописанное сообщение */}
            <div className="feed-body" hidden={tab !== 'chat'}>
              <Chat chat={chat} you={you} canControl={canControl} send={send} />
            </div>
            <div className="feed-body" hidden={tab !== 'queue'}>
              <Queue queue={room.queue} player={room.player} canControl={canControl} send={send} />
            </div>
          </section>
        </aside>
      </div>

      {renaming && <NameModal initial={name} onDone={saveName} onCancel={() => setRenaming(false)} />}
      {createPortal(
        <div className={toastOn ? 'toast px px-raised is-on' : 'toast px px-raised'} role="status" aria-live="polite">
          {toast?.text}
        </div>,
        document.body,
      )}
    </div>
  );
}
