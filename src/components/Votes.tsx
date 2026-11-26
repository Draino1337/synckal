import { fmtCount, type VideoInfo } from '../lib/videoInfo.ts';
import { Icon } from './Icon.tsx';

/** Лайки и дизлайки: две плашки и пиксельная шкала соотношения между ними. */
export function Votes({ info }: { info: VideoInfo | null }) {
  if (!info || info.likes === null) return info ? null : <span className="votes is-loading" aria-hidden="true" />;
  const likes = info.likes;
  const dislikes = info.dislikes ?? 0;
  const ratio = likes + dislikes ? likes / (likes + dislikes) : 1;
  return (
    <div className="votes" title="Дизлайки — оценка Return YouTube Dislike: YouTube их больше не показывает">
      <span className="vote is-like">
        <Icon name="like" size={14} />
        {fmtCount(likes)}
      </span>
      <span className="vote-bar" style={{ '--r': `${(ratio * 100).toFixed(1)}%` } as React.CSSProperties}>
        <i />
      </span>
      <span className="vote is-dislike">
        <Icon name="like" size={14} />
        {fmtCount(dislikes)}
      </span>
      {info.views !== null && <span className="vote-views">{fmtCount(info.views)} просмотров</span>}
    </div>
  );
}
