import { useEffect, useState } from 'react';

export interface Storyboard {
  url: string; // $M — номер листа
  w: number;
  h: number;
  count: number;
  cols: number;
  rows: number;
  interval: number; // мс между кадрами; 0 — кадры равномерно по всему видео
}
export interface VideoInfo {
  storyboard: Storyboard | null;
  chapters: { t: number; title: string }[];
  sponsor?: [number, number][]; // рекламные вставки (SponsorBlock), с; сервер их пропускает
  likes: number | null;
  dislikes: number | null;
  views: number | null;
}

const cache = new Map<string, VideoInfo>();

/** Раскадровка, главы и лайки текущего видео (сервер берёт их со страницы YouTube и Return YouTube Dislike). */
export function useVideoInfo(videoId: string | null) {
  const [info, setInfo] = useState<VideoInfo | null>(() => (videoId ? cache.get(videoId) ?? null : null));
  useEffect(() => {
    if (!videoId) return setInfo(null);
    const hit = cache.get(videoId);
    if (hit) return setInfo(hit);
    setInfo(null);
    let dead = false;
    fetch(`/api/video/${videoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VideoInfo | null) => {
        if (!d || dead) return;
        cache.set(videoId, d);
        setInfo(d);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [videoId]);
  return info;
}

/** Кадр раскадровки для секунды t: какой лист и где на нём кадр. */
export function storyFrame(sb: Storyboard, t: number, dur: number) {
  const raw = sb.interval ? (t * 1000) / sb.interval : dur ? (t / dur) * sb.count : 0;
  const idx = Math.min(sb.count - 1, Math.max(0, Math.floor(raw)));
  const per = sb.cols * sb.rows;
  const k = idx % per;
  return { url: sb.url.replace('$M', String(Math.floor(idx / per))), x: (k % sb.cols) * sb.w, y: Math.floor(k / sb.cols) * sb.h };
}

const compact = new Intl.NumberFormat('ru', { notation: 'compact', maximumFractionDigits: 1 });
export const fmtCount = (n: number) => compact.format(n).replace(/ /g, ' ');
