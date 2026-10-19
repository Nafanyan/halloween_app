import { describe, expect, it } from 'vitest';
import { mediaKindOk } from '../src/admin/mediaKind';

describe('mediaKindOk', () => {
  it('accepts matching extensions, case-insensitive', () => {
    expect(mediaKindOk('a1.JPG', 'image')).toBe(true);
    expect(mediaKindOk('a.svg', 'image')).toBe(true);
    expect(mediaKindOk('a.m4a', 'audio')).toBe(true);
    expect(mediaKindOk('a.ogg', 'audio')).toBe(true);
  });
  it('rejects the wrong kind or no extension', () => {
    expect(mediaKindOk('a.mp3', 'image')).toBe(false);
    expect(mediaKindOk('a.png', 'audio')).toBe(false);
    expect(mediaKindOk('a.gif', 'image')).toBe(false);
    expect(mediaKindOk('mp3', 'audio')).toBe(false);
  });
});
