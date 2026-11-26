/** Пиксельные эффекты: маски мозаичного появления, зерно панелей и наблюдатель за .rv-элементами. */

/** детерминированный ГПСЧ — маски одинаковые при каждой загрузке */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const svg = (body: string, size: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size} ${size}' shape-rendering='crispEdges'>${body}</svg>`)}")`;

/** Семь масок 16×16 клеток: открыто от 1/8 до 7/8 клеток, каждая следующая содержит все клетки предыдущей. */
function mosaicMasks(): string[] {
  const rand = rng(7);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return [1, 2, 3, 4, 5, 6, 7].map((k) => k / 8).map((share) => {
    const cells = order.slice(0, Math.round(256 * share));
    return svg(cells.map((c) => `<rect x='${c % 16}' y='${c >> 4}' width='1' height='1'/>`).join(''), 16);
  });
}

/** Зерно для панелей: редкие светлые и тёмные пиксели на прозрачном, плитка 48×48. */
function grain(): string {
  const rand = rng(42);
  let body = '';
  for (let i = 0; i < 48 * 48; i++) {
    const r = rand();
    const at = `x='${i % 48}' y='${Math.floor(i / 48)}' width='1' height='1'`;
    if (r < 0.06) body += `<rect ${at} fill='#fff' fill-opacity='0.035'/>`;
    else if (r < 0.1) body += `<rect ${at} fill='#000' fill-opacity='0.25'/>`;
  }
  return svg(body, 48);
}

/** Ставит CSS-переменные --mz1…--mz4 и --tex и включает мозаичное появление для всех .rv на странице. */
export function initPixel() {
  const root = document.documentElement.style;
  mosaicMasks().forEach((m, i) => root.setProperty(`--mz${i + 1}`, m));
  root.setProperty('--tex', grain());

  const io = new IntersectionObserver(
    (entries) => {
      // всё, что вошло в окно одним пакетом (сетка моделей, строки рейтинга), выходит каскадом по 35 мс
      let n = 0;
      for (const e of entries) {
        if (e.isIntersecting) {
          const el = e.target as HTMLElement;
          if (!el.style.getPropertyValue('--rv-delay')) el.style.setProperty('--rv-delay', `${Math.min(n * 35, 350)}ms`);
          n++;
          // атрибут, а не класс: React перезаписывает className при обновлении и стёр бы отметку
          el.dataset.in = '';
          io.unobserve(el);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  const watch = (el: Element) => el.classList.contains('rv') && !(el as HTMLElement).hasAttribute('data-in') && io.observe(el);
  document.querySelectorAll('.rv').forEach(watch);
  // React дорисовывает страницы позже — подхватываем новые .rv по мере появления
  new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          watch(n);
          n.querySelectorAll('.rv').forEach(watch);
        }
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}
