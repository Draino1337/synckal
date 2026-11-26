/** Загрузка YouTube IFrame API — один раз на всю страницу. */

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
  // минимальные типы того, чем пользуемся
  namespace YT {
    interface Player {
      loadVideoById(o: { videoId: string; startSeconds?: number }): void;
      cueVideoById(o: { videoId: string; startSeconds?: number }): void;
      playVideo(): void;
      pauseVideo(): void;
      stopVideo(): void;
      seekTo(s: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): number;
      getPlaybackRate(): number;
      setPlaybackRate(r: number): void;
      setVolume(v: number): void;
      mute(): void;
      unMute(): void;
      getVideoLoadedFraction(): number;
      loadModule(name: string): void;
      unloadModule(name: string): void;
      destroy(): void;
    }
    interface PlayerEvent {
      target: Player;
      data: number;
    }
    const Player: new (el: HTMLElement, opts: Record<string, unknown>) => Player;
  }
}

let ready: Promise<typeof YT> | null = null;

export function loadYT(): Promise<typeof YT> {
  if (ready) return ready;
  ready = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return ready;
}

/** состояния плеера YouTube */
export const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export const YT_ERRORS: Record<number, string> = {
  2: 'Неверный id видео',
  5: 'Плеер не может воспроизвести это видео',
  100: 'Видео удалено или приватное',
  101: 'Автор запретил встраивать это видео',
  150: 'Автор запретил встраивать это видео',
};
