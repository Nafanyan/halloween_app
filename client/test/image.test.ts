import { describe, expect, it } from 'vitest';
import { fitSize } from '../src/admin/image';

describe('fitSize', () => {
  it('keeps small images', () => expect(fitSize(800, 600, 1200)).toEqual({ w: 800, h: 600 }));
  it('scales long side to max', () => expect(fitSize(4032, 3024, 1200)).toEqual({ w: 1200, h: 900 }));
  it('portrait', () => expect(fitSize(3024, 4032, 1200)).toEqual({ w: 900, h: 1200 }));
});
