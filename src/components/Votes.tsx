import { useEffect, useRef, useState } from 'react';
import { fmtCount, type VideoInfo } from '../lib/videoInfo.ts';
import { Icon } from './Icon.tsx';

const NOISE = '#%&*+=-:.<>/\\|';

/** Число «проявляется» из ASCII-шума: слева направо символы встают на место. */
function useScramble(text: string) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setOut(text);
    let frame = 0;
    const total = 12;
    const id = setInterval(() => {
      frame++;
      const fixed = Math.floor((frame / total) * text.length);
      setOut(
        [...text]
          .map((ch, i) => (i < fixed || ch === ' ' || ch === ',' ? ch : NOISE[(Math.random() * NOISE.length) | 0]))
          .join(''),
      );
      if (frame >= total) {
        clearInterval(id);
        setOut(text);
      }
    }, 45);
    return () => clearInterval(id);
  }, [text]);
  return out;
}

const SPARKS = { like: ['+', '*', '^', '+', '*', 'o', '·'], dislike: ['-', 'x', '.', '-', '~', 'x', '.'] };

/** Взрыв ASCII-искр: у лайка взлетают вверх, у дизлайка осыпаются вниз. */
function Burst({ kind }: { kind: 'like' | 'dislike' }) {
  const [parts] = useState(() =>
    SPARKS[kind].map((ch, i) => ({ ch, dx: Math.round((Math.random() - 0.5) * 44), d: i * 35 + Math.round(Math.random() * 40) })),
  );
  return (
    <span className="vote-burst" aria-hidden="true">
      {parts.map((p, i) => (
        <i key={i} style={{ '--dx': `${p.dx}px`, animationDelay: `${p.d}ms` } as React.CSSProperties}>
          {p.ch}
        </i>
      ))}
    </span>
  );
}

function VoteChip({ kind, n }: { kind: 'like' | 'dislike'; n: number }) {
  const text = fmtCount(n);
  const shown = useScramble(text);
  const [bursts, setBursts] = useState<number[]>([]);
  const seq = useRef(0);
  const burst = () => {
    const id = ++seq.current;
    setBursts((b) => [...b.slice(-2), id]);
    setTimeout(() => setBursts((b) => b.filter((x) => x !== id)), 1100);
  };
  // искры — при появлении числа и при наведении
  useEffect(() => {
    const t = setTimeout(burst, kind === 'like' ? 350 : 500);
    return () => clearTimeout(t);
  }, [text, kind]);

  return (
    <span className={`vote is-${kind}`} onMouseEnter={burst}>
      <span className="vote-box">
        <Icon name="like" size={14} />
        <b>{shown}</b>
      </span>
      {bursts.map((id) => (
        <Burst key={id} kind={kind} />
      ))}
    </span>
  );
}

/** Лайки и дизлайки (дизлайки — оценка Return YouTube Dislike) и просмотры. */
export function Votes({ info }: { info: VideoInfo | null }) {
  if (!info || info.likes === null) return info ? null : <span className="votes is-loading" aria-hidden="true" />;
  return (
    <div className="votes" title="Дизлайки — оценка Return YouTube Dislike: YouTube их больше не показывает">
      <VoteChip kind="like" n={info.likes} />
      <VoteChip kind="dislike" n={info.dislikes ?? 0} />
      {info.views !== null && <span className="vote-views">{fmtCount(info.views)} просмотров</span>}
    </div>
  );
}
