import type { ErrorCode, GameState, Result } from '@quiz/shared';

const err = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });
const ok = (state: GameState): Result => ({ ok: true, state });

const startsWith = (buf: Uint8Array, at: number, bytes: number[]) => bytes.every((b, i) => buf[at + i] === b);

export function imageExt(buf: Uint8Array): 'jpg' | 'png' | 'webp' | null {
  if (startsWith(buf, 0, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(buf, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(buf, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, 8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  return null;
}

export function setAvatar(s: GameState, playerId: string, url: string | undefined): Result {
  if (!s.players.some((p) => p.id === playerId)) return err('NOT_FOUND');
  return ok({
    ...s,
    players: s.players.map((p) => {
      if (p.id !== playerId) return p;
      const { avatar: _old, ...rest } = p;
      return url === undefined ? rest : { ...rest, avatar: url };
    }),
  });
}
