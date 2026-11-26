import { useState } from 'react';
import type { RoomState, Role } from '../lib/room.ts';
import { Icon } from './Icon.tsx';

interface Props {
  room: RoomState;
  you: string | null;
  myRole: Role;
  send: (m: Record<string, unknown>) => void;
  onRename: () => void;
}

/** Участники и настройки комнаты (настройки видит только ведущий). */
export function Users({ room, you, myRole, send, onRename }: Props) {
  const [menu, setMenu] = useState<string | null>(null);
  const [title, setTitle] = useState(room.settings.title);
  const leader = myRole === 'leader';
  const staff = myRole !== 'user';

  return (
    <section className="users px">
      <div className="chat-head">
        <span className="label">В комнате · {room.users.length}</span>
      </div>
      <ul className="u-list">
        {room.users.map((u) => {
          const me = !!you && u.ids.includes(you);
          const canAct = !me && (leader || (staff && u.role === 'user'));
          return (
            <li key={u.id} className="u">
              <i className="u-dot" style={{ background: u.color }} />
              <span className="u-name">
                {u.name}
                {me && <em> (ты)</em>}
              </span>
              {u.role === 'leader' && (
                <span className="u-role is-lead" title="Ведущий">
                  <Icon name="crown" size={14} />
                </span>
              )}
              {u.role === 'mod' && (
                <span className="u-role" title="Модератор">
                  <Icon name="star" size={14} />
                </span>
              )}
              {me && (
                <button className="u-more" onClick={onRename} title="Сменить ник" aria-label="Сменить ник">
                  <Icon name="gear" size={14} />
                </button>
              )}
              {canAct && (
                <button className="u-more" onClick={() => setMenu(menu === u.id ? null : u.id)} aria-label={`Действия: ${u.name}`} aria-expanded={menu === u.id}>
                  ⋯
                </button>
              )}
              {menu === u.id && (
                <div className="u-menu px px-raised" onMouseLeave={() => setMenu(null)}>
                  {leader && (
                    <button onClick={() => (send({ t: 'promote', uid: u.id, role: u.role === 'mod' ? 'user' : 'mod' }), setMenu(null))}>
                      <Icon name="star" size={14} /> {u.role === 'mod' ? 'Снять модератора' : 'Сделать модератором'}
                    </button>
                  )}
                  {leader && (
                    <button onClick={() => confirm(`Передать корону: ${u.name}?`) && (send({ t: 'promote', uid: u.id, role: 'leader' }), setMenu(null))}>
                      <Icon name="crown" size={14} /> Передать корону
                    </button>
                  )}
                  <button className="is-bad" onClick={() => (send({ t: 'kick', uid: u.id }), setMenu(null))}>
                    <Icon name="x" size={14} /> Выгнать
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {leader ? (
        <div className="set">
          <span className="label">Настройки</span>
          <label className="tgl">
            <input type="checkbox" checked={room.settings.open} onChange={(e) => send({ t: 'settings', open: e.target.checked })} />
            <i />
            Управлять плеером и очередью могут все
          </label>
          <label className="tgl">
            <input type="checkbox" checked={room.settings.listed} onChange={(e) => send({ t: 'settings', listed: e.target.checked })} />
            <i />
            Показывать комнату на главной
          </label>
          <form
            className="set-title"
            onSubmit={(e) => {
              e.preventDefault();
              send({ t: 'settings', title });
            }}
          >
            <label className="q-field px px-well">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название комнаты" maxLength={48} aria-label="Название комнаты" />
            </label>
            <button className="btn btn-ghost btn-sm" disabled={title === room.settings.title}>
              OK
            </button>
          </form>
        </div>
      ) : (
        <p className="set-note">
          {room.settings.open ? 'Управлять плеером и очередью могут все.' : 'Плеером и очередью управляют ведущий и модераторы. Остальные могут голосовать за пропуск.'}
        </p>
      )}
    </section>
  );
}
