import { useEffect, useRef } from 'react';

/** Символы от тёмного к светлому и цвета: от чёрного к фиолетовому, без белого — белым на сайте
    набран текст, и на самом светлом месте планеты он должен оставаться заметно светлее неё. */
const RAMP = ' .:-=+*#%@';
const STOPS: [number, [number, number, number]][] = [
  [0, [22, 12, 44]],
  [0.35, [72, 36, 160]],
  [0.7, [126, 76, 236]],
  [1, [168, 128, 255]],
];
const LEVELS = 28;
const BG = '#0a0a0c';
// упорядоченный дизеринг 4×4: плавный градиент без полос, в духе пиксельного сайта
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

const color = (v: number) => {
  let i = 1;
  while (STOPS[i][0] < v) i++;
  const [a, ca] = STOPS[i - 1];
  const [b, cb] = STOPS[i];
  const k = (v - a) / (b - a);
  return `rgb(${ca.map((c, j) => Math.round(c + (cb[j] - c) * k)).join(',')})`;
};

/** Плотность колец по радиусу (в радиусах планеты): кольца C, B, щель Кассини, A с щелью Энке, тонкие бороздки. */
const ringDensity = (r: number) => {
  if (r < 1.24 || r > 2.27) return 0;
  let d = r < 1.52 ? 0.3 : r < 1.95 ? 0.95 : r < 2.03 ? 0.04 : Math.abs(r - 2.2) < 0.012 ? 0.08 : 0.7;
  d *= (0.82 + 0.18 * Math.sin(r * 97)) * (0.9 + 0.1 * Math.sin(r * 251));
  return d * Math.min(1, (r - 1.24) / 0.05, (2.27 - r) / 0.03);
};

/** псевдослучайное 0…1 по номеру клетки — у каждого символа своё время и траектория появления */
const hash = (a: number, b: number, c = 0) => {
  let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// заставка: символы вылетают по спирали и садятся на место, от центра к краю колец и по кругу
const SPREAD = 1500; // за это время стартуют все символы, мс
const FLY = 750; // полёт одного символа
const INTRO = SPREAD + FLY;
const READY_AT = 1800; // тогда начинает появляться сайт, пока долетают последние символы

/** Гигантский ASCII-Сатурн за всем сайтом. Каждая клетка — луч: попал в шар (полосы, свет, тень от колец)
    или в кольца (тень планеты). Свет идёт за мышью, кольца чуть наклоняются; на сенсорных экранах свет
    медленно гуляет сам. Перерисовка — часто, пока мышь «доезжает», иначе редко: полосы медленно вращаются.
    При открытии Сатурн собирается из символов, затем вызывается onReady — показать остальной сайт;
    клик, клавиша или прокрутка пропускают заставку. При «уменьшить движение» — сразу неподвижный кадр. */
export function Saturn({ onReady }: { onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = matchMedia('(hover: none)').matches;
    let w = 0, h = 0, dpr = 1, fs = 16, cw = 8, ch = 16, cols = 0, rows = 0;
    let solid: HTMLCanvasElement, clear: HTMLCanvasElement; // атласы символов: на фоне (планета) и прозрачный (кольца)
    let raf = 0, last = 0, drawnAt = 0, spin = 0;
    let introAt = -1, age = still ? INTRO : 0, told = false; // время заставки, мс
    const tell = () => {
      if (!told) (told = true), ready.current?.();
    };
    const mouse = { x: 0, y: 0 }; // цель, −1…1
    const cur = { x: 0, y: 0 }; // плавно догоняет цель
    let drawn = { x: NaN, y: NaN };

    const atlas = (bg: boolean) => {
      const a = document.createElement('canvas');
      a.width = cw * LEVELS;
      a.height = ch;
      const c = a.getContext('2d')!;
      c.font = `${fs * dpr}px DotGothic16, ui-monospace, monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let i = 0; i < LEVELS; i++) {
        if (bg) {
          c.fillStyle = BG;
          c.fillRect(i * cw, 0, cw, ch);
        }
        const v = i / (LEVELS - 1);
        const chr = RAMP[Math.min(RAMP.length - 1, Math.round(v * (RAMP.length - 1)))];
        c.fillStyle = color(v);
        c.fillText(chr, i * cw + cw / 2, ch / 2 + dpr);
      }
      return a;
    };

    const build = () => {
      // без полосы прокрутки: холст fixed растянут на ширину окна за вычетом её места
      w = document.documentElement.clientWidth;
      h = window.innerHeight;
      dpr = Math.min(2, Math.round((window.devicePixelRatio || 1) * 4) / 4);
      // на узком экране символы мельче, иначе в ширину помещается слишком мало клеток и Сатурн не узнать
      fs = w < 700 ? 10 : 16;
      cw = Math.round((fs / 2) * dpr);
      ch = Math.round(fs * dpr);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      cols = Math.ceil(canvas.width / cw);
      rows = Math.ceil(canvas.height / ch);
      solid = atlas(true);
      clear = atlas(false);
      drawn = { x: NaN, y: NaN };
    };

    const draw = () => {
      const mx = cur.x, my = cur.y;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // радиус планеты; с кольцами Сатурн занимает почти весь экран
      const R = Math.min(w * 0.45, h * 0.34) * dpr;
      const cx = (w * (w > h ? 0.56 : 0.5) - mx * w * 0.025) * dpr;
      const cy = (h * 0.5 - my * h * 0.025) * dpr;
      const roll = -0.36 + mx * 0.1;
      const tilt = 0.42 + my * 0.16;
      const cr = Math.cos(roll), sr = Math.sin(roll), ct = Math.cos(tilt), st = Math.sin(tilt);
      // свет: со стороны курсора, чуть спереди
      let lx = -0.35 + mx * 1.1, ly = -0.45 + my * 0.9, lz = 0.6;
      const ln = Math.hypot(lx, ly, lz);
      lx /= ln; ly /= ln; lz /= ln;
      [lx, ly] = [lx * cr + ly * sr, -lx * sr + ly * cr]; // в повёрнутую систему колец
      // ось планеты — нормаль колец N; e1, e2 — экватор для долготы полос
      const nx = 0, ny = -ct, nz = st;
      const nl = ny * ly + nz * lz;
      const e2y = st, e2z = ct;

      for (let row = 0; row < rows; row++) {
        const py = (row + 0.5) * ch - cy;
        for (let col = 0; col < cols; col++) {
          const px = (col + 0.5) * cw - cx;
          const x = (px * cr + py * sr) / R;
          const y = (-px * sr + py * cr) / R;
          if (x * x + y * y > 5.3) continue;

          const yo = y / 0.92; // сплюснут у полюсов
          const s2 = x * x + yo * yo;
          const zs = s2 < 1 ? Math.sqrt(1 - s2) : -Infinity;
          const zr = (y * ct) / st;
          const r = Math.sqrt(x * x + y * y + zr * zr);
          const dens = ringDensity(r);
          let v = 0;
          let onPlanet = false;

          if (dens > 0 && zr > zs) {
            // кольца перед планетой или сбоку от неё; тень планеты на кольцах
            const pl = x * lx + y * ly + zr * lz;
            const shadow = pl < 0 && r * r - pl * pl < 1;
            v = dens * (0.6 + 0.4 * Math.abs(nl)) * (shadow ? 0.1 : 1);
            onPlanet = zs > -Infinity;
          } else if (zs > -Infinity) {
            onPlanet = true;
            let gx = x, gy = yo / 0.92, gz = zs;
            const gn = Math.hypot(gx, gy, gz);
            gx /= gn; gy /= gn; gz /= gn;
            const lam = Math.max(0, gx * lx + gy * ly + gz * lz);
            const lat = gx * nx + gy * ny + gz * nz;
            const lon = Math.atan2(gy * e2y + gz * e2z, gx) + spin;
            const bands = 0.78 + 0.13 * Math.sin(lat * 15 + 0.7 * Math.sin(lon * 3 + lat * 6)) + 0.09 * Math.sin(lat * 41 + lon);
            v = 0.06 + Math.pow(lam, 0.6) * bands * (0.85 + 0.15 * gz);
            // тень колец на планете
            if (nl !== 0) {
              const t = -(x * nx + y * ny + zs * nz) / nl;
              if (t > 0) {
                const qx = x + t * lx, qy = y + t * ly, qz = zs + t * lz;
                v *= 1 - 0.65 * ringDensity(Math.sqrt(qx * qx + qy * qy + qz * qz));
              }
            }
          }

          let lv = Math.round(Math.min(1, v) * (LEVELS - 1) + BAYER[(col & 3) + (row & 3) * 4]);
          lv = lv < 0 ? 0 : lv >= LEVELS ? LEVELS - 1 : lv;
          if (!lv && !onPlanet) continue;

          if (age < INTRO) {
            const rnd = hash(col, row);
            const ang = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
            const p = (age - (0.5 * Math.min(1, Math.sqrt(x * x + y * y) / 2.3) + 0.3 * ang + 0.2 * rnd) * SPREAD) / FLY;
            if (p <= 0) continue;
            if (p < 1) {
              if (!lv) continue;
              // летит: по спирали к своему месту, ярче и с перебором символов, к концу успокаивается
              const q = Math.pow(1 - p, 3);
              const th = q * (0.7 + 0.8 * hash(row, col, 7));
              const sc = 1 + q * 0.45;
              const ox = (col + 0.5) * cw - cx, oy = (row + 0.5) * ch - cy;
              const c = Math.cos(th), s = Math.sin(th);
              const flick = p < 0.8 ? hash(col, row, (age / 60) | 0) : 0;
              const glv = Math.min(LEVELS - 1, Math.round(lv + (LEVELS - 1 - lv) * Math.max(q, flick * (1 - p))));
              ctx.globalAlpha = Math.min(1, p * 4);
              ctx.drawImage(clear, glv * cw, 0, cw, ch, cx + (ox * c - oy * s) * sc - cw / 2, cy + (ox * s + oy * c) * sc - ch / 2, cw, ch);
              ctx.globalAlpha = 1;
              continue;
            }
          }
          ctx.drawImage(onPlanet ? solid : clear, lv * cw, 0, cw, ch, col * cw, row * ch, cw, ch);
        }
      }
      drawn = { x: mx, y: my };
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      const dt = last ? Math.min(t - last, 64) : 16;
      last = t;
      spin += dt * 0.00005;
      if (touch) {
        mouse.x = Math.sin(t / 7000) * 0.6;
        mouse.y = Math.sin(t / 9000) * 0.4;
      }
      const k = 1 - Math.pow(0.9, dt / 16);
      cur.x += (mouse.x - cur.x) * k;
      cur.y += (mouse.y - cur.y) * k;
      if (introAt < 0) introAt = t;
      const intro = age < INTRO;
      if (intro) age = t - introAt;
      if (age >= READY_AT) tell();
      // кадр стоит ~5–10 мс: заставка — каждый кадр, за мышью — до 30 в секунду, в покое (и на сенсорных экранах) — 5
      const moving = !touch && Math.abs(cur.x - drawn.x) + Math.abs(cur.y - drawn.y) > 0.002;
      if (intro || t - drawnAt > (moving ? 30 : 200)) {
        draw();
        drawnAt = t;
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mouse.x = (e.clientX / w) * 2 - 1;
      mouse.y = (e.clientY / h) * 2 - 1;
    };
    const onResize = () => {
      build();
      if (still) draw();
    };
    const skip = () => {
      if (age < INTRO) age = INTRO;
      tell();
      for (const ev of SKIP) window.removeEventListener(ev, skip);
    };
    const SKIP = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

    let alive = true;
    // ASCII рисуем пиксельным шрифтом; если не загрузился — моноширинный из запаса
    document.fonts.load('16px DotGothic16', '@#%*').catch(() => {}).finally(() => {
      if (!alive) return;
      build();
      if (still) {
        draw();
        tell();
      } else {
        raf = requestAnimationFrame(loop);
        window.addEventListener('pointermove', onMove, { passive: true });
        for (const ev of SKIP) window.addEventListener(ev, skip, { passive: true });
      }
      window.addEventListener('resize', onResize);
    });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      for (const ev of SKIP) window.removeEventListener(ev, skip);
    };
  }, []);

  return <canvas ref={ref} className="saturn" aria-hidden="true" />;
}
