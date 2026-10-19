import { imageExt } from '../game/avatar';

export type MediaKind = 'image' | 'audio';
export type MediaExt = 'jpg' | 'png' | 'webp' | 'svg' | 'mp3' | 'ogg' | 'wav' | 'm4a';

export const MAX_MEDIA_BYTES: Record<MediaKind, number> = {
  image: 5 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

const startsWith = (buf: Uint8Array, at: number, bytes: number[]) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

function isSvg(buf: Uint8Array): boolean {
  const head = new TextDecoder().decode(buf.subarray(0, 1024)).replace(/^﻿/, '').trimStart();
  return (head.startsWith('<svg') || head.startsWith('<?xml')) && head.includes('<svg');
}

function audioExt(buf: Uint8Array): 'mp3' | 'ogg' | 'wav' | 'm4a' | null {
  if (startsWith(buf, 0, ascii('ID3')) || (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0)) return 'mp3';
  if (startsWith(buf, 0, ascii('OggS'))) return 'ogg';
  if (startsWith(buf, 0, ascii('RIFF')) && startsWith(buf, 8, ascii('WAVE'))) return 'wav';
  if (startsWith(buf, 4, ascii('ftyp'))) return 'm4a';
  return null;
}

export function detectMedia(buf: Uint8Array): { kind: MediaKind; ext: MediaExt } | null {
  const img = imageExt(buf);
  if (img) return { kind: 'image', ext: img };
  if (isSvg(buf)) return { kind: 'image', ext: 'svg' };
  const aud = audioExt(buf);
  if (aud) return { kind: 'audio', ext: aud };
  return null;
}
