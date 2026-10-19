import { useCallback, useEffect, useRef, useState } from 'react';

const VOLUME = 0.4;
const FADE_MS = 1500;

/** Looping lobby music: quiet, fades out over 1.5 s when `playing` turns false. */
export function useLobbyMusic(url: string | undefined, playing: boolean): { blocked: boolean; unlock: () => void } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [blocked, setBlocked] = useState(false);

  const stopFade = () => {
    if (fadeRef.current) {
      clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
  };

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;
    audio.play().then(() => setBlocked(false), () => setBlocked(true));
  }, []);

  // Restart on url change.
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.loop = true;
      audio.volume = VOLUME;
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    stopFade();
    audio.pause();
    if (!url) {
      audio.removeAttribute('src');
      setBlocked(false);
      return;
    }
    audio.src = url;
    audio.currentTime = 0;
    if (playing) tryPlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Start / fade out on phase change.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !url) return;
    if (playing) {
      stopFade();
      if (audio.paused) tryPlay();
      else audio.volume = VOLUME;
      return;
    }
    setBlocked(false);
    if (audio.paused) return;
    stopFade();
    const startedAt = Date.now();
    const from = audio.volume;
    fadeRef.current = setInterval(() => {
      const t = Math.min(1, (Date.now() - startedAt) / FADE_MS);
      audio.volume = from * (1 - t);
      if (t >= 1) {
        stopFade();
        audio.pause();
      }
    }, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => () => {
    stopFade();
    audioRef.current?.pause();
  }, []);

  return { blocked, unlock: tryPlay };
}
