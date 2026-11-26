import type { ReactNode } from 'react';

/** Иконки — пиксельные: рисуются квадратами 1×1 на сетке 16×16, без сглаживания. */
const P: Record<string, ReactNode> = {
  play: <path d="M4 2h2v1h2v1h2v1h2v1h1v4h-1v1h-2v1H8v1H6v1H4z" />,
  pause: <path d="M3 2h4v12H3zM9 2h4v12H9z" />,
  next: <path d="M2 2h2v1h2v1h2v1h1v1h1V2h3v12h-3v-4H9v1H8v1H6v1H4v1H2z" />,
  vol: <path d="M1 6h3V5h1V4h1V3h2v10H6v-1H5v-1H4v-1H1zM10 5h1v6h-1zM12 3h1v1h1v8h-1v1h-1z" />,
  mute: <path d="M1 6h3V5h1V4h1V3h2v10H6v-1H5v-1H4v-1H1zM10 5h1v1h1v1h1V6h1V5h1v1h-1v1h-1v2h1v1h1v1h-1v-1h-1V9h-1v1h-1v1h-1v-1h1V9h1V7h-1V6h-1z" />,
  full: <path d="M1 1h5v2H3v3H1zM10 1h5v5h-2V3h-3zM1 10h2v3h3v2H1zM13 10h2v5h-5v-2h3z" />,
  sync: <path d="M4 2h7v1h1v1h1v2h-2V5h-1V4H5v1H4v2h2v1H2V3h2zM10 8h4v5h-2v1H5v-1H4v-1H3v-2h2v1h1v1h5v-1h1V9h-2z" />,
  link: <path d="M3 5h5v2H4v2h4v2H3V10H2V6h1zM8 5h5v1h1v4h-1v1H8V9h4V7H8z" />,
  crown: <path d="M1 4h2v2h1v1h1V5h1V3h1V2h2v1h1v2h1v2h1V6h1V4h2v9H1zM3 11h10v1H3z" />,
  star: <path d="M7 1h2v4h4v2h-1v1h-1v1h1v3h1v2h-2v-1h-1v-1H9v1H7v-1H6v1H5v1H3v-2h1V9h1V8H4V7H3V5h4z" />,
  user: <path d="M6 2h4v1h1v4h-1v1H6V7H5V3h1zM3 10h1V9h8v1h1v1h1v3H2v-3h1z" />,
  users: <path d="M4 2h3v1h1v3H7v1H4V6H3V3h1zM10 3h2v1h1v2h-1v1h-2V6H9V4h1zM2 9h7v1h1v4H1v-4h1zM11 9h3v1h1v3h-4z" />,
  chat: <path d="M2 2h12v1h1v8h-1v1H7v1H6v1H5v1H4v-3H2v-1H1V3h1zM4 5h8v1H4zM4 8h6v1H4z" />,
  list: <path d="M1 2h2v2H1zM5 2h10v2H5zM1 7h2v2H1zM5 7h10v2H5zM1 12h2v2H1zM5 12h10v2H5z" />,
  plus: <path d="M7 2h2v5h5v2H9v5H7V9H2V7h5z" />,
  x: <path d="M2 2h2v1h1v1h1v1h1v1h2V5h1V4h1V3h1V2h2v2h-1v1h-1v1h-1v1H9v2h1v1h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1H9v-1H7v1H6v1H5v1H4v1H2v-2h1v-1h1v-1h1V9h1V7H5V6H4V5H3V4H2z" />,
  up: <path d="M7 2h2v1h1v1h1v1h1v1h1v2H9v6H7V8H3V6h1V5h1V4h1V3h1z" />,
  shuffle: <path d="M1 3h4v1h1v1h1v2H6V6H5V5H1zM10 2h2v1h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1V7H9v1H8v2h1v1h1V9h1v1h1v1h1v1h-1v1h-1v1h-1v1h-1v-2H9v-1H8v-1H7V9H6v1H5v1H1V9h4V8h1V6h1V5h1V4h2z" />,
  gear: <path d="M7 1h2v2h2V2h1v1h1v1h-1v2h2v2h-2v2h1v1h-1v1h-1v-1H9v2H7v-2H5v1H4v-1H3v-1h1V9H2V7h2V5H3V4h1V3h1v1h2zM7 6v1H6v2h1v1h2V9h1V7H9V6z" />,
  copy: <path d="M5 1h9v10h-2V3H5zM2 4h8v11H2z" />,
  check: <path d="M13 3h2v2h-1v1h-1v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-1H4v-1H3v-1H2V9H1V7h2v1h1v1h1v1h1V9h1V8h1V7h1V6h1V5h1V4h1V3h1z" />,
  arrow: <path d="M8 2h2v1h1v1h1v1h1v1h1v1h1v2h-1v1h-1v1h-1v1h-1v1h-1v1H8v-2h1v-1h1v-1H1V7h9V6H9V5H8z" />,
  skip: <path d="M1 2h2v1h1v1h1v1h1v1h1V2h2v1h1v1h1v1h1v1h1V2h2v12h-2v-4h-1v1h-1v1h-1v1H9v1H7v-4H6v1H5v1H4v1H3v1H1z" />,
  // логотип-«экранчик» с треугольником, как у кнопки YouTube
  yt: <path d="M2 3h12v1h1v8h-1v1H2v-1H1V4h1zM6 5v6h1v-1h2V9h1V7H9V6H7V5z" fillRule="evenodd" />,
  tv:<path d="M4 1h1v1h1v1h4V2h1V1h1v1h-1v1h3v1h1v9h-1v1H2v-1H1V4h1V3h3V2H4zM3 5v7h10V5z" />,
};

export function Icon({ name, size = 16, className }: { name: keyof typeof P | string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
