import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRoom } from '../lib/room.ts';
import { randomName, store } from '../lib/util.ts';
import { link } from '../router.ts';
import { Player } from '../components/Player.tsx';
import { Queue } from '../components/Queue.tsx';
import { Chat } from '../components/Chat.tsx';
import { Users } from '../components/Users.tsx';
import { Icon } from '../components/Icon.tsx';

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
  const [toastOn, setToastOn] = useState(false);

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
    try {
      await navigator.clipboard.writeText(location.origin + '/r/' + id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      prompt('Скопируй ссылку:', location.origin + '/r/' + id);
    }
  };

  if (!name) return <NameModal initial={randomName()} onDone={saveName} />;

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
      <div className="room-top">
        <h1 className="room-name">{room.settings.title || 'Комната'}</h1>
        <button className="room-code chip" onClick={copy} title="Скопировать ссылку-приглашение">
          /r/{id}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Скопировано' : 'Пригласить'}
        </button>
        {status === 'reconnecting' && <span className="room-warn">Связь потеряна, переподключаемся…</span>}
      </div>

      <div className="room-grid">
        <div className="room-main">
          <Player player={room.player} serverNow={serverNow} canControl={canControl} send={send} skip={room.skip} notify={notify} />
          <div className="now">
            {room.player.videoId ? (
              <>
                <span className="label">Сейчас играет</span>
                <a className="now-title" href={`https://www.youtube.com/watch?v=${room.player.videoId}`} target="_blank" rel="noreferrer">
                  {room.player.title}
                </a>
                {room.player.author && <small>{room.player.author}</small>}
              </>
            ) : (
              <span className="label">Ничего не играет</span>
            )}
          </div>
          <Queue queue={room.queue} player={room.player} canControl={canControl} send={send} />
        </div>
        <aside className="room-side">
          <Users room={room} you={you} myRole={myRole} send={send} onRename={() => setRenaming(true)} />
          <Chat chat={chat} you={you} canControl={canControl} send={send} />
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
