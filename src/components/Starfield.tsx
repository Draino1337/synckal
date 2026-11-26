import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  s: number; // размер в css-пикселях: 1 или 2
  base: number; // базовая яркость
  speed: number;
  phase: number;
  depth: number; // доля прокрутки, на которую звезда сдвигается: дальние — меньше
  lav: boolean; // лавандовая или белёсая
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number; // прожито, мс
  life: number;
}

const WHITE = '#d7d4df';
const LAV = '#b8a7f0';

/** Фон всего сайта: квадратные «звёзды» мерцают и с разной скоростью уплывают при прокрутке (параллакс),
    изредка падает фиолетовая пиксельная звезда. При «уменьшить движение» — неподвижное небо.

    Чтобы не отнимать кадры у страницы: холст в css-пикселях (на ретине браузер просто увеличивает его,
    звёзды-квадраты от этого не портятся), яркость — через globalAlpha без сборки строк цвета,
    а перерисовка — только когда что-то изменилось: прокрутка, летящая звезда или раз в 50 мс для мерцания. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let nextMeteor = 2000 + Math.random() * 3000;
    let raf = 0;
    let w = 0;
    let h = 0;
    let last = 0;
    let acc = 0;
    let lastScroll = -1;

    const build = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const count = Math.round((w * h) / 4600);
      stars = Array.from({ length: count }, () => {
        const r = Math.random();
        const near = r > 0.93;
        return {
          x: Math.floor(Math.random() * w),
          y: Math.floor(Math.random() * h),
          s: near ? 2 : 1,
          base: 0.12 + Math.random() * 0.4,
          speed: 0.4 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          depth: near ? 0.22 : 0.04 + Math.random() * 0.12,
          lav: r > 0.85,
        };
      });
      lastScroll = -1;
    };

    const drawStars = (t: number, scroll: number) => {
      ctx.clearRect(0, 0, w, h);
      const sec = t / 1000;
      // два прохода по цвету — fillStyle меняется дважды за кадр, а не на каждой звезде
      for (const lav of [false, true]) {
        ctx.fillStyle = lav ? LAV : WHITE;
        for (const st of stars) {
          if (st.lav !== lav) continue;
          ctx.globalAlpha = still ? st.base : st.base * (0.55 + 0.45 * Math.sin(sec * st.speed + st.phase));
          const y = (((st.y - scroll * st.depth) % h) + h) % h;
          ctx.fillRect(st.x, Math.round(y), st.s, st.s);
        }
      }
    };

    // падающая звезда: фиолетовая голова 2×2 с ореолом и пиксельный хвост, тускнеющий к концу;
    // падает круто вниз-влево. Появляется редко, изредка — сразу парой.
    const drawMeteors = (dt: number) => {
      nextMeteor -= dt;
      if (nextMeteor <= 0) {
        const n = Math.random() < 0.25 ? 2 : 1;
        for (let j = 0; j < n; j++) {
          const sp = 0.42 + Math.random() * 0.22;
          const ang = (100 + Math.random() * 22) * (Math.PI / 180); // от вертикали чуть влево
          meteors.push({
            x: w * (0.2 + Math.random() * 0.8),
            y: -20 + h * Math.random() * 0.3,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            t: -j * (250 + Math.random() * 400),
            life: 1100 + Math.random() * 700,
          });
        }
        nextMeteor = 7000 + Math.random() * 9000;
      }
      for (const m of meteors) {
        m.t += dt;
        if (m.t < 0) continue;
        const k = m.t / m.life;
        const fade = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.55) / 0.45);
        const hx = m.x + m.vx * m.t;
        const hy = m.y + m.vy * m.t;
        const len = 22;
        for (let i = len - 1; i >= 0; i--) {
          const a = fade * Math.pow(1 - i / len, 1.4);
          ctx.fillStyle = i < 3 ? '#ceb2ff' : '#9660ff';
          ctx.globalAlpha = a * (i < 3 ? 0.95 : 0.8);
          const sz = i < 6 ? 2 : 1;
          ctx.fillRect(Math.round(hx - m.vx * i * 6), Math.round(hy - m.vy * i * 6), sz, sz);
        }
        const hx0 = Math.round(hx);
        const hy0 = Math.round(hy);
        ctx.fillStyle = '#a06eff';
        ctx.globalAlpha = fade * 0.22;
        ctx.fillRect(hx0 - 2, hy0 - 2, 6, 6);
        ctx.fillStyle = '#f4ecff';
        ctx.globalAlpha = fade;
        ctx.fillRect(hx0, hy0, 2, 2);
      }
      meteors = meteors.filter((m) => m.t < m.life);
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      acc += last ? Math.min(t - last, 64) : 16;
      last = t;
      const scroll = window.scrollY;
      if (!meteors.length && scroll === lastScroll && acc < 50 && nextMeteor > acc) return;
      lastScroll = scroll;
      drawStars(t, scroll);
      drawMeteors(acc);
      acc = 0;
    };

    build();
    if (still) drawStars(0, 0);
    else raf = requestAnimationFrame(loop);

    const onResize = () => {
      build();
      if (still) drawStars(0, 0);
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return <canvas ref={ref} className="stars" aria-hidden="true" />;
}
