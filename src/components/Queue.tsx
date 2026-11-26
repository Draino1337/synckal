import { useEffect, useState } from 'react';
import type { PlayerState, QueueItem } from '../lib/room.ts';
import { findYoutube, thumb } from '../lib/util.ts';
import { Icon } from './Icon.tsx';

interface Props {
  queue: QueueItem[];
  player: PlayerState;
  canControl: boolean;
  send: (m: Record<string, unknown>) => void;
}

/** Плейлист: поле для ссылки, сейчас играет и очередь с перетаскиванием. */
export function Queue({ queue, player, canControl, send }: Props) {
  const [url, setUrl] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [bad, setBad] = useState(false); // ссылка не похожа на YouTube — поле не очищаем
  // «Очистить» спрашивает подтверждение вторым нажатием; через 3 с вопрос сам исчезает
  const [sure, setSure] = useState(false);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(false), 3000);
    return () => clearTimeout(t);
  }, [sure]);

  const add = (mode: 'end' | 'next' | 'now') => {
    const v = url.trim();
    if (!v) return;
    if (!/^[w-]{11}$/.test(v) && !findYoutube(v)) return setBad(true);
    send({ t: 'add', url: v, mode });
    setUrl('');
  };

  return (
    <section className="q px">
      <form
        className="q-add"
        onSubmit={(e) => {
          e.preventDefault();
          add('end');
        }}
      >
        <label className="q-field px px-well">
          <Icon name="link" />
          <input
            value={url}
            onChange={(e) => (setUrl(e.target.value), setBad(false))}
            onPaste={(e) => {
              // вставили ссылку в пустое поле — сразу добавляем в конец
              const text = e.clipboardData.getData('text').trim();
              if (!url && /youtu\.?be/.test(text) && canControl) {
                e.preventDefault();
                send({ t: 'add', url: text, mode: player.videoId ? 'end' : 'now' });
              }
            }}
            placeholder={canControl ? 'Вставь ссылку на YouTube' : 'Добавлять видео может ведущий'}
            disabled={!canControl}
            aria-label="Ссылка на видео YouTube"
          />
        </label>
        <div className="q-modes">
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canControl || !url.trim()}>
            <Icon name="plus" /> В очередь
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canControl || !url.trim()} onClick={() => add('next')} title="Поставить следующим">
            Следующим
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!canControl || !url.trim()} onClick={() => add('now')} title="Включить прямо сейчас">
            Сейчас
          </button>
        </div>
      </form>
      {bad && <p className="q-bad">Это не похоже на ссылку YouTube — нужна ссылка вида youtube.com/watch?v=… или youtu.be/…</p>}

      <div className="q-head">
        <span className="label">Очередь · {queue.length}</span>
        {canControl && queue.length > 1 && (
          <button className="q-tool" onClick={() => send({ t: 'shuffle' })} title="Перемешать">
            <Icon name="shuffle" /> Перемешать
          </button>
        )}
        {canControl && queue.length > 0 && (
          <button
            className={sure ? 'q-tool is-sure' : 'q-tool'}
            onClick={() => {
              if (!sure) return setSure(true);
              send({ t: 'clear' });
              setSure(false);
            }}
            title="Очистить очередь"
          >
            <Icon name="x" /> {sure ? 'Точно очистить?' : 'Очистить'}
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <p className="q-none">
          Очередь пуста. {player.videoId ? 'Когда видео закончится, плеер остановится.' : 'Добавь первое видео — оно сразу включится.'}
        </p>
      ) : (
        <ol className="q-list" onDragLeave={() => setOver(null)}>
          {queue.map((it, i) => (
            <li
              key={it.id}
              className={'q-item' + (drag === it.id ? ' is-drag' : '') + (over === i && drag !== it.id ? ' is-over' : '')}
              draggable={canControl}
              onDragStart={(e) => {
                setDrag(it.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag && drag !== it.id) send({ t: 'move', id: drag, to: i });
                setDrag(null);
                setOver(null);
              }}
            >
              <span className="q-n">{String(i + 1).padStart(2, '0')}</span>
              <img className="q-thumb" src={thumb(it.videoId)} alt="" loading="lazy" width={96} height={54} />
              <div className="q-meta">
                <span className="q-title" title={it.title}>
                  {it.title}
                </span>
                <small>
                  {it.author && <>{it.author} · </>}добавил(а) {it.by}
                </small>
              </div>
              {canControl && (
                <div className="q-acts">
                  <button onClick={() => send({ t: 'playItem', id: it.id })} title="Включить сейчас" aria-label="Включить сейчас">
                    <Icon name="play" />
                  </button>
                  {i > 0 && (
                    <button onClick={() => send({ t: 'move', id: it.id, to: 0 })} title="Поднять наверх" aria-label="Поднять наверх">
                      <Icon name="up" />
                    </button>
                  )}
                  <button onClick={() => send({ t: 'remove', id: it.id })} title="Убрать" aria-label="Убрать из очереди">
                    <Icon name="x" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
