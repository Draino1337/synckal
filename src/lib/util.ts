/** Мелочи: время, хранилище, имя гостя, разбор ссылок YouTube на клиенте. */

export const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem('synckal:' + key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem('synckal:' + key, value);
    } catch {
      /* приватное окно — живём без памяти */
    }
  },
};

/** постоянный id клиента: по нему сервер узнаёт ведущего после перезагрузки страницы */
export function clientId() {
  let id = store.get('cid');
  if (!id) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('cid', id);
  }
  return id;
}

const ADJ = ['Сонный', 'Пиксельный', 'Ночной', 'Тихий', 'Лунный', 'Быстрый', 'Хитрый', 'Добрый', 'Звёздный', 'Ленивый'];
const NOUN = ['Котик', 'Енот', 'Филин', 'Лис', 'Барсук', 'Ёжик', 'Пингвин', 'Кракен', 'Хомяк', 'Сурок'];
export const randomName = () => ADJ[(Math.random() * ADJ.length) | 0] + ' ' + NOUN[(Math.random() * NOUN.length) | 0];

export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

const YT_RE = /(?:https?:\/\/)?(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|embed\/)|youtu\.be\/)[\w-]{11}[^\s]*/i;
/** первая ссылка на YouTube в тексте (для кнопки «в плейлист» в чате) */
export const findYoutube = (text: string) => text.match(YT_RE)?.[0] ?? null;

/** код комнаты из того, что вставили в поле: код или ссылка вида …/r/код */
export function roomFromInput(input: string) {
  const s = input.trim().toLowerCase();
  const m = s.match(/\/r\/([a-z0-9-]{3,32})/) ?? s.match(/^([a-z0-9-]{3,32})$/);
  return m ? m[1] : null;
}
