import { describe, expect, it } from 'vitest';
import type { GameState } from '@quiz/shared';
import * as L from '../src/game/logic';
import { imageExt, setAvatar } from '../src/game/avatar';

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Uint8Array.from([...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP'), 0]);

const withPlayer = (): GameState => {
  const r = L.registerPlayer(L.initialState(), 'Anna', 'p1');
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('avatar', () => {
  it('imageExt: jpeg/png/webp', () => {
    expect(imageExt(JPEG)).toBe('jpg');
    expect(imageExt(PNG)).toBe('png');
    expect(imageExt(WEBP)).toBe('webp');
  });
  it('imageExt: garbage, empty, RIFF without WEBP → null', () => {
    expect(imageExt(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(imageExt(new Uint8Array())).toBeNull();
    expect(imageExt(Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]))).toBeNull();
  });
  it('setAvatar: sets, replaces, clears', () => {
    const set = setAvatar(withPlayer(), 'p1', '/media/avatars/a.jpg');
    if (!set.ok) throw new Error(set.error);
    expect(set.state.players[0].avatar).toBe('/media/avatars/a.jpg');
    const rep = setAvatar(set.state, 'p1', '/media/avatars/b.png');
    if (!rep.ok) throw new Error(rep.error);
    expect(rep.state.players[0].avatar).toBe('/media/avatars/b.png');
    const cleared = setAvatar(rep.state, 'p1', undefined);
    if (!cleared.ok) throw new Error(cleared.error);
    expect('avatar' in cleared.state.players[0]).toBe(false);
  });
  it('setAvatar: unknown player → NOT_FOUND', () => {
    expect(setAvatar(L.initialState(), 'nope', '/media/avatars/x.jpg')).toEqual({ ok: false, error: 'NOT_FOUND' });
  });
});
