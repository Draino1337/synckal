import { useEffect } from 'react';
import { usePath, link } from './router.ts';
import { Starfield } from './components/Starfield.tsx';
import { AsciiLogo } from './components/AsciiLogo.tsx';
import { Home } from './pages/Home.tsx';
import { Room } from './pages/Room.tsx';

export default function App() {
  const path = usePath();
  const m = path.match(/^\/r\/([a-z0-9-]{3,32})\/?$/i);
  const roomId = m ? m[1].toLowerCase() : null;
  const lost = !roomId && path !== '/';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <>
      <Starfield />
      <header className="hdr">
        <div className="hdr-in">
          <a href="/" onClick={link} className="logo" aria-label="synckal — на главную">
            <AsciiLogo />
            <b className="logo-txt">
              sync<span>kal</span>
            </b>
          </a>
          {roomId && (
            <a href="/" onClick={link} className="hdr-home btn btn-ghost btn-sm">
              Новая комната
            </a>
          )}
        </div>
      </header>
      <main key={roomId ?? path} className="page">
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
  );
}
