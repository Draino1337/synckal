import { useEffect, useRef, useState } from 'react';
import { usePath, link } from './router.ts';
import { Starfield } from './components/Starfield.tsx';
import { Saturn } from './components/Saturn.tsx';
import { AsciiLogo } from './components/AsciiLogo.tsx';
import { Home } from './pages/Home.tsx';
import { Room } from './pages/Room.tsx';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const path = usePath();
  const m = path.match(/^\/r\/([a-z0-9-]{3,32})\/?$/i);
  const roomId = m ? m[1].toLowerCase() : null;
  const isHome = path === '/';
  const lost = !roomId && !isHome;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  // заставка, как в govnoreview: на главной сначала из символов собирается Сатурн, потом появляется сайт.
  // В комнату по ссылке пускаем сразу. Запасной таймер — если холст не дорисует.
  const [ready, setReady] = useState(() => !isHome || calm());
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), 4000);
    return () => clearTimeout(id);
  }, [ready]);
  // первая страница после заставки выходит мозаикой (.intro-in), следующие — обычным всплытием
  const section = roomId ?? path;
  const first = useRef<string | null>(null);
  if (ready && first.current === null) first.current = section;
  else if (first.current && first.current !== section) first.current = '';

  return (
    <>
      <Starfield />
      {/* Сатурн — только на главной: в комнате он отвлекал бы от видео и тратил процессор */}
      {isHome && <Saturn onReady={() => setReady(true)} />}
      {ready && (
        <>
          <header className="hdr">
            <div className="hdr-in">
              <a href="/" onClick={(e) => (location.pathname === "/" ? (e.preventDefault(), window.scrollTo({ top: 0, behavior: "smooth" })) : link(e))} className="logo" aria-label="synckal — на главную">
                <AsciiLogo />
                <b className="logo-txt">
                  sync<span>kal</span>
                </b>
              </a>
              {roomId && (
                <a href="/" onClick={link} className="hdr-home btn btn-ghost btn-sm">
                  Все комнаты
                </a>
              )}
            </div>
          </header>
          <main key={section} className={section === first.current && isHome ? 'page intro-in' : 'page'}>
            {roomId ? (
              <Room id={roomId} />
            ) : lost ? (
              <div className="wrap lost">
                <h1>Такой страницы нет</h1>
                <p>Комнаты живут по адресу вида /r/код.</p>
                <a className="btn btn-primary" href="/" onClick={link}>
                  На главную
                </a>
              </div>
            ) : (
              <Home />
            )}
          </main>
        </>
      )}
    </>
  );
}
