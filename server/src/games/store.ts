import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ActiveGame, GameDef } from '@quiz/shared';
import { QuestionsError } from '../questions';
import { GAME_ID_RE, parseGame } from './validate';

export type GameEntry = { id: string; def: GameDef } | { id: string; error: string };

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function newGameId(): string {
  let s = 'g-';
  for (const b of crypto.randomBytes(8)) s += ID_CHARS[b % ID_CHARS.length];
  return s;
}

export function emptyGame(title: string): GameDef {
  return {
    version: 1, title, subtitle: '', description: '',
    scoring: { wrongPenalty: false, startScore: 0 },
    rounds: [], shop: [],
  };
}

export function referencedMedia(def: GameDef): Set<string> {
  const s = new Set<string>();
  const add = (n?: string) => { if (n) s.add(n); };
  add(def.lobbyMusic);
  add(def.background);
  for (const r of def.rounds)
    for (const t of r.themes)
      for (const q of t.questions) { add(q.image); add(q.audio); }
  for (const it of def.shop) add(it.image);
  return s;
}

export class GameLibrary {
  private games = new Map<string, GameEntry>();

  constructor(private readonly gamesDir: string) {
    fs.mkdirSync(gamesDir, { recursive: true });
    for (const d of fs.readdirSync(gamesDir, { withFileTypes: true })) {
      if (d.isDirectory() && GAME_ID_RE.test(d.name)) this.games.set(d.name, this.load(d.name));
    }
  }

  private load(id: string): GameEntry {
    try {
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(path.join(this.gamesDir, id, 'game.json'), 'utf8'));
      } catch (e) {
        throw new QuestionsError(`не удалось прочитать JSON (${(e as Error).message})`);
      }
      return { id, def: parseGame(raw, this.mediaDir(id)) };
    } catch (e) {
      if (e instanceof QuestionsError) return { id, error: e.message };
      throw e;
    }
  }

  entries(): GameEntry[] {
    const all = [...this.games.values()];
    const ok = all.filter((e): e is { id: string; def: GameDef } => 'def' in e)
      .sort((a, b) => a.def.title.localeCompare(b.def.title, 'ru'));
    const broken = all.filter((e) => 'error' in e).sort((a, b) => a.id.localeCompare(b.id));
    return [...ok, ...broken];
  }

  get(id: string): GameEntry | undefined { return this.games.get(id); }

  def(id: string): GameDef | null {
    const e = this.games.get(id);
    return e && 'def' in e ? e.def : null;
  }

  mediaDir(id: string): string { return path.join(this.gamesDir, id, 'media'); }

  create(title: string): ActiveGame {
    const id = newGameId();
    const def = emptyGame(title);
    fs.mkdirSync(this.mediaDir(id), { recursive: true });
    this.save(id, def);
    return { id, def };
  }

  duplicate(id: string): ActiveGame | null {
    const src = this.def(id);
    if (!src) return null;
    const nid = newGameId();
    fs.cpSync(path.join(this.gamesDir, id), path.join(this.gamesDir, nid), { recursive: true });
    const def = { ...src, title: [...`${src.title} (копия)`].slice(0, 60).join('') };
    this.save(nid, def);
    return { id: nid, def };
  }

  save(id: string, def: GameDef): void {
    const file = path.join(this.gamesDir, id, 'game.json');
    const tmp = file + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(def, null, 2));
      fs.renameSync(tmp, file);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      throw e;
    }
    this.games.set(id, { id, def });
  }

  remove(id: string): void {
    fs.rmSync(path.join(this.gamesDir, id), { recursive: true, force: true });
    this.games.delete(id);
  }

  sweepMedia(id: string): string[] {
    const def = this.def(id);
    if (!def) return [];
    const keep = referencedMedia(def);
    const dir = this.mediaDir(id);
    const removed: string[] = [];
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isFile() && !keep.has(f.name)) {
        fs.rmSync(path.join(dir, f.name), { force: true });
        removed.push(f.name);
      }
    }
    return removed;
  }
}
