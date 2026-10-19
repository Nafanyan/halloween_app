import { describe, expect, it } from 'vitest';
import { blocksPlayback } from '../src/screen/lobbyMusic';

const err = (name: string) => Object.assign(new Error(name), { name });

describe('blocksPlayback', () => {
  it('автоплей запрещён, пока музыка должна играть → blocked', () => {
    expect(blocksPlayback(err('NotAllowedError'), true)).toBe(true);
    expect(blocksPlayback(err('NotSupportedError'), true)).toBe(true);
  });

  it('play() прерван паузой или сменой src — не blocked', () => {
    expect(blocksPlayback(err('AbortError'), true)).toBe(false);
  });

  it('музыка уже не должна играть — не blocked', () => {
    expect(blocksPlayback(err('NotAllowedError'), false)).toBe(false);
  });
});
