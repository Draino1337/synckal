import { useEffect, useRef } from 'react';

/* ASCII-логотип шапки: котик и слово «synckal», набранное линиями _ / \ | ( ) — как баннеры figlet.
   Появление: всё «печатается» слева направо, фронт — шумные символы и курсор █.
   В покое: котик моргает и помахивает хвостом, раз в несколько секунд по буквам проходит блик.
   Под курсором мыши: буквы на миг рассыпаются и строки дёргаются (глитч),
   котик жмурится от удовольствия (^.^, w) и машет хвостом быстрее, блик бегает по кругу.
   На узких экранах рисуется только котик, слово остаётся обычным текстом. */

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const COMPACT = '(max-width: 940px)';

// 5 рядов: 0 — над строчными (точка i), 1 — верх букв, 2 — середина, 3 — низ, 4 — хвост g
const FONT: Record<string, string[]> = {
  s: ['     ', ' ___ ', '(_-< ', '/__/ ', '     '],
  y: ['      ', ' _  _ ', '| || |', ' \\_, |', ' |__/ '],
  n: ['      ', ' _ _  ', "| ' \\ ", '|_||_|', '      '],
  c: ['     ', ' __  ', '/ _| ', '\\__| ', '     '],
  k: [' _   ', '| |__', '| / /', '|_\\_\\', '     '],
  a: ['      ', ' __ _ ', '/ _` |', '\\__,_|', '      '],
  l: [' _ ', '| |', '| |', '|_|', '   '],
};
// котик; хвост и мордочка дорисовываются в каждом кадре
// котик сидит на той же линии, что и буквы: уши — ряд 0, лапки — ряд 3
const CAT = ['  /\\_/\\   ', ' ( o.o )  ', '  > ^ <   ', ' (")_(")  ', '          '];
const CAT_W = CAT[0].length;
const TAIL: [number, number, string][][] = [
  [[8, 3, '_'], [9, 2, '/']],
  [[8, 3, '_'], [9, 3, '~']],
  [[8, 3, '_'], [9, 2, '/']],
  [[8, 3, '~']],
];

const ROWS = 5;
const enum K {
  None,
  Cat,
  Face,
  Govno,
  Review,
  Cursor,
}

// слово: что стоит в каждой клетке
const kind: K[][] = Array.from({ length: ROWS }, () => []);
const base: string[][] = Array.from({ length: ROWS }, () => []);
let cx = CAT_W + 1;
[...'synckal'].forEach((ch, i) => {
  FONT[ch].forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === ' ') return;
      kind[y][cx + x] = i < 4 ? K.Govno : K.Review;
      base[y][cx + x] = c;
    }),
  );
  cx += FONT[ch][0].length;
});
// +1 колонка — место для курсора, который бежит по фронту при «печати»
const FULL_W = cx + 1;

const NOISE = '#@%$*+=/\\?!~^';
const noise = () => NOISE[(Math.random() * NOISE.length) | 0];
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);

const BUILD = 1400; // мс на «печать»
const GLITCH = 450; // мс рассыпания под курсором
const CLS: Record<K, string> = { [K.None]: '', [K.Cat]: 'k', [K.Face]: 'f', [K.Govno]: 'g', [K.Review]: 'r', [K.Cursor]: 'c' };

/** котик в момент t: моргание, хвост, мордочка под курсором */
function cat(t: number, hov: boolean, still: boolean) {
  t = Math.max(0, t); // метка кадра rAF бывает раньше t0 — отрицательный индекс сломал бы хвост
  const g = CAT.map((r) => [...r]);
  const tail = still ? TAIL[0] : TAIL[Math.floor(t / (hov ? 130 : 520)) % TAIL.length];
  for (const [x, y, c] of tail) g[y][x] = c;
  // моргает раз в ~3.7 с, иногда дважды подряд
  const p = t % 3700;
  const blink = !still && (p < 140 || (Math.floor(t / 3700) % 3 === 1 && p > 260 && p < 380));
  const eye = hov ? '^' : blink ? '-' : 'o';
  g[1][3] = eye;
  g[1][5] = eye;
  if (hov) g[2][4] = 'w';
  return g;
}

const esc = (c: string) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c);

export function AsciiLogo() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const link = el.closest('a') ?? el;
    const still = calm();
    const mq = matchMedia(COMPACT);
    let hoverAt = -1; // когда навели; -1 — курсора нет
    let shift: number[] = new Array(ROWS).fill(0);
    const t0 = performance.now();

    const draw = (now: number) => {
      const t = still ? 1e9 : now - t0;
      const hov = hoverAt >= 0;
      const ht = hov ? now - hoverAt : 1e9;
      const glitch = !still && ht < GLITCH ? 1 - ht / GLITCH : 0;
      const W = mq.matches ? CAT_W : FULL_W;
      const kitty = cat(still ? 0 : now - t0, hov, still);

      // печать: ровный темп, как в терминале; за фронтом 3 колонки шума
      const k = t / (BUILD - 100);
      const front = t < BUILD ? (0.8 * k + 0.2 * ease(k)) * (W + 3) : Infinity;
      // блик: в покое — раз в 6 с, под курсором — по кругу
      let shine = -99;
      if (hov && !still) shine = ((ht % 900) / 600) * (W + ROWS) - 3;
      else if (t > BUILD + 600 && !still) shine = (((t - BUILD - 600) % 6000) / 800) * (W + ROWS) - 3;
      if (glitch > 0.35 && Math.random() < 0.5) shift = shift.map(() => (Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0));
      else if (glitch <= 0.35) shift = shift.map(() => 0);
      const blink = hov || Math.floor(t / 530) % 2 === 0;

      let html = '';
      for (let y = 0; y < ROWS; y++) {
        let cls = '', run = '';
        const flush = () => {
          if (run) html += cls ? `<span class="${cls}">${run}</span>` : run;
          run = '';
        };
        for (let x = 0; x < W; x++) {
          let c = ' ', cl = '';
          if (x < CAT_W) {
            c = kitty[y][x];
            if (c !== ' ') cl = (y === 1 && (x === 3 || x === 5)) || (y === 2 && x === 4) ? 'f' : 'k';
          } else {
            const sx = x - shift[y];
            let kd = kind[y][sx] ?? K.None;
            if (kd === K.Cursor && (!blink || front < Infinity)) kd = K.None;
            if (kd !== K.None) {
              c = base[y][sx];
              cl = CLS[kd];
              if (kd !== K.Cursor && Math.abs(sx + y - shine) < 1.3) cl += ' l';
              if (glitch && kd !== K.Cursor && Math.random() < glitch * 0.45) {
                c = noise();
                cl = 'n';
              }
            }
          }
          if (x > front) c = ' ';
          else if (x > front - 3 && c !== ' ') {
            c = noise();
            cl = 'n';
          }
          if (front < Infinity && Math.floor(front) === x && y >= 1 && y <= 3) {
            c = '█';
            cl = 'c';
          }
          if (c === ' ') cl = '';
          if (cl !== cls) {
            flush();
            cls = cl;
          }
          run += esc(c);
        }
        flush();
        html += '\n';
      }
      el.innerHTML = html;
    };

    draw(performance.now());
    const onMq = () => draw(performance.now());
    mq.addEventListener('change', onMq);
    if (still) return () => mq.removeEventListener('change', onMq);

    const enter = () => {
      if (hoverAt < 0) hoverAt = performance.now();
    };
    const leave = () => {
      hoverAt = -1;
    };
    link.addEventListener('pointerenter', enter);
    link.addEventListener('pointerleave', leave);
    link.addEventListener('focus', enter);
    link.addEventListener('blur', leave);

    // ~12 кадров в секунду в покое, ~30 — пока печатается и под курсором
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const busy = hoverAt >= 0 || now - t0 < BUILD + 100;
      if (document.hidden || now - last < (busy ? 33 : 80)) return;
      last = now;
      draw(now);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener('change', onMq);
      link.removeEventListener('pointerenter', enter);
      link.removeEventListener('pointerleave', leave);
      link.removeEventListener('focus', enter);
      link.removeEventListener('blur', leave);
    };
  }, []);

  return <pre ref={ref} className="alogo" aria-hidden="true" />;
}
