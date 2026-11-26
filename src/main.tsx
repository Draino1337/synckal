import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/base.css';
import './styles/pixel.css';
import './styles/home.css';
import './styles/room.css';
import { initPixel } from './lib/pixel.ts';
import App from './App.tsx';

initPixel();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
