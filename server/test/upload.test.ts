import { describe, expect, it } from 'vitest';
import { detectMedia, MAX_MEDIA_BYTES } from '../src/games/upload';

const bytes = (...xs: number[]) => Uint8Array.from(xs);
const ascii = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

describe('detectMedia', () => {
  it('detects jpg', () => {
    expect(detectMedia(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ kind: 'image', ext: 'jpg' });
  });

  it('detects png', () => {
    expect(detectMedia(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toEqual({
      kind: 'image',
      ext: 'png',
    });
  });

  it('detects webp', () => {
    const buf = concat(ascii('RIFF'), bytes(0x24, 0x00, 0x00, 0x00), ascii('WEBP'));
    expect(detectMedia(buf)).toEqual({ kind: 'image', ext: 'webp' });
  });

  it('detects svg starting with <svg', () => {
    expect(detectMedia(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toEqual({ kind: 'image', ext: 'svg' });
  });

  it('detects svg with xml prolog', () => {
    expect(detectMedia(ascii('<?xml version="1.0"?>\n<svg></svg>'))).toEqual({ kind: 'image', ext: 'svg' });
  });

  it('detects svg after BOM and whitespace', () => {
    const buf = concat(bytes(0xef, 0xbb, 0xbf), ascii('  \n<svg></svg>'));
    expect(detectMedia(buf)).toEqual({ kind: 'image', ext: 'svg' });
  });

  it('does not detect svg when <svg is beyond the first 1024 bytes', () => {
    const buf = concat(ascii('<?xml version="1.0"?>'), ascii('a'.repeat(1100)), ascii('<svg></svg>'));
    expect(detectMedia(buf)).toBeNull();
  });

  it('detects mp3 with ID3 tag', () => {
    expect(detectMedia(ascii('ID3\x03\x00'))).toEqual({ kind: 'audio', ext: 'mp3' });
  });

  it('detects mp3 by frame sync', () => {
    expect(detectMedia(bytes(0xff, 0xfb, 0x90, 0x00))).toEqual({ kind: 'audio', ext: 'mp3' });
  });

  it('detects ogg', () => {
    expect(detectMedia(concat(ascii('OggS'), bytes(0x00, 0x02, 0x00)))).toEqual({ kind: 'audio', ext: 'ogg' });
  });

  it('detects wav', () => {
    const buf = concat(ascii('RIFF'), bytes(0x24, 0x00, 0x00, 0x00), ascii('WAVE'));
    expect(detectMedia(buf)).toEqual({ kind: 'audio', ext: 'wav' });
  });

  it('detects m4a by ftyp box', () => {
    const buf = concat(bytes(0x00, 0x00, 0x00, 0x20), ascii('ftypM4A '));
    expect(detectMedia(buf)).toEqual({ kind: 'audio', ext: 'm4a' });
  });

  it('returns null for html with xml prolog', () => {
    expect(detectMedia(ascii('<?xml version="1.0"?><html>'))).toBeNull();
  });

  it('returns null for plain text', () => {
    expect(detectMedia(Buffer.from('hello'))).toBeNull();
  });

  it('returns null for RIFF container that is neither webp nor wav', () => {
    const buf = concat(ascii('RIFF'), bytes(0x24, 0x00, 0x00, 0x00), ascii('AVI '));
    expect(detectMedia(buf)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectMedia(new Uint8Array(0))).toBeNull();
  });
});

describe('MAX_MEDIA_BYTES', () => {
  it('limits images to 5 MB and audio to 20 MB', () => {
    expect(MAX_MEDIA_BYTES).toEqual({ image: 5 * 1024 * 1024, audio: 20 * 1024 * 1024 });
  });
});
