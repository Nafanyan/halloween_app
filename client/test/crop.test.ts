import { describe, expect, it } from 'vitest';
import { squareCrop } from '../src/avatar/crop';

describe('squareCrop', () => {
  it('landscape', () => expect(squareCrop(4032, 3024)).toEqual({ sx: 504, sy: 0, size: 3024 }));
  it('portrait', () => expect(squareCrop(3024, 4032)).toEqual({ sx: 0, sy: 504, size: 3024 }));
  it('square', () => expect(squareCrop(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 }));
  it('odd difference floors the offset', () => expect(squareCrop(101, 100)).toEqual({ sx: 0, sy: 0, size: 100 }));
});
