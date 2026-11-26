import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';

export type Quality = 'auto' | 'tiny' | 'small' | 'medium' | 'large' | 'hd720' | 'hd1080' | 'hd1440' | 'hd2160';

const HEIGHT: Record<Exclude<Quality, 'auto'>, number> = {
  tiny: 144,
  small: 240,
  medium: 360,
  large: 480,
  hd720: 720,
  hd1080: 1080,
  hd1440: 1440,
  hd2160: 2160,
};
// ниже 480p встроенный плеер не опускается, как его ни уменьшай, — такие пункты не показываем
const ALL: Exclude<Quality, 'auto'>[] = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large'];

export const qLabel = (q: string) => (q === 'auto' ? 'Авто' : q === 'hd2160' ? '4K' : HEIGHT[q as keyof typeof HEIGHT] ? `${HEIGHT[q as keyof typeof HEIGHT]}p` : '');
const chip = (q: string) => (q === 'hd2160' ? '4K' : q === 'hd1440' ? 'QHD' : q === 'hd1080' || q === 'hd720' ? 'HD' : null);

/**
 * Размер и масштаб iframe. YouTube берёт качество по размеру плеера в физических пикселях,
 * так что для «1080p» плеер раскладывается на 1080 / devicePixelRatio точек в высоту и ужимается
 * transform-ом под экран. Сверху и снизу плеер на m точек выше экрана: туда уезжают заголовок,
 * «Поделиться» и «Смотреть на YouTube», которые YouTube показывает поверх видео, а видео
 * (16:9 по ширине) остаётся видно целиком.
 */
export function frameGeometry(box: { w: number; h: number }, q: Quality) {
  const w = box.w || 640;
  const h = box.h || 360;
  const videoH = Math.min(h, (w * 9) / 16);
  const s = q === 'auto' ? 1 : videoH / (HEIGHT[q] / (window.devicePixelRatio || 1));
  const lw = w / s;
  const lh = h / s;
  const m = Math.round(Math.max(64, (videoH / s) * 0.14));
  return { w: lw, h: lh + 2 * m, m, s };
}

interface Props {
  quality: Quality;
  levels: string[];
  actual: string;
  disabled: boolean;
  onPick: (q: Quality) => void;
}

/** Кнопка качества с выпадающим пиксельным меню. */
export function QualityMenu({ quality, levels, actual, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const known = ALL.filter((q) => levels.includes(q));
  const options: Quality[] = ['auto', ...(known.length ? known : ALL)];
  const shown = quality === 'auto' ? actual : quality;
  const badge = chip(shown);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="pl-q" ref={root}>
      <button
        className={open ? 'pl-btn pl-qbtn is-open' : 'pl-btn pl-qbtn'}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Качество: ${qLabel(quality)}`}
        title="Качество видео"
      >
        <Icon name="gear" size={16} />
        <span className="pl-qval">{quality === 'auto' ? 'Авто' : qLabel(quality)}</span>
        {badge && <b className={'pl-qchip' + (shown === 'hd2160' || shown === 'hd1440' ? ' is-top' : '')}>{badge}</b>}
      </button>
      {open && (
        <div className="pl-qmenu" role="menu" aria-label="Качество">
          <div className="pl-qhead">
            <span>Качество</span>
            {actual && <em>сейчас {qLabel(actual)}</em>}
          </div>
          {options.map((q, i) => (
            <button
              key={q}
              role="menuitemradio"
              aria-checked={q === quality}
              className={q === quality ? 'pl-qopt is-on' : 'pl-qopt'}
              style={{ '--i': i } as React.CSSProperties}
              onClick={() => {
                onPick(q);
                setOpen(false);
              }}
            >
              <i className="pl-qdot" />
              <span>{qLabel(q)}</span>
              {q === 'auto' ? <small>по размеру экрана</small> : chip(q) && <b className={'pl-qchip' + (q === 'hd2160' || q === 'hd1440' ? ' is-top' : '')}>{chip(q)}</b>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
