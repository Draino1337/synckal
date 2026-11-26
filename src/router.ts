import { useSyncExternalStore } from 'react';

/** Маршруты по обычному пути (/r/код): сервер на любой незнакомый путь отдаёт index.html. */
const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
};

export function usePath() {
  return useSyncExternalStore(subscribe, () => location.pathname);
}

export function go(path: string, replace = false) {
  if (path === location.pathname) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** обработчик клика по внутренней ссылке: без перезагрузки страницы */
export function link(e: React.MouseEvent<HTMLAnchorElement>) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go(e.currentTarget.getAttribute('href')!);
}
