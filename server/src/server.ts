import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ActiveGame, AudioAction, ClientToServerEvents, GameState, Result, ServerToClientEvents,
} from '@quiz/shared';
import { loadState, readActiveGameId, saveState } from './persistence';
import { clientItem, editView, mediaUrl, summarize, toAdminView, toPublicView, trophiesOf } from './views';
import * as logic from './game/logic';
import * as shop from './game/shop';
import { imageExt, setAvatar } from './game/avatar';
import { GameLibrary } from './games/store';
import { migrate } from './games/migrate';
import { GAME_ID_RE } from './games/validate';
import { MAX_MEDIA_BYTES, detectMedia } from './games/upload';
import {
  type AckFn, type QuizSocket, type SocketData, ackOf, fail, findGame, obj, registerGameHandlers,
} from './games/handlers';

export interface QuizServerOptions {
  dataDir: string; statePath: string;
  pin: string; joinUrl: string; clientDist?: string;
}

const AUDIO_ACTIONS: AudioAction[] = ['play', 'pause', 'restart'];
const noop: AckFn = () => {};
const MAX_AVATAR_BYTES = 1024 * 1024;
const playerRoom = (id: string) => `player:${id}`;
/** Загруженный SVG раздаётся с того же origin — запрещаем ему скрипты и чужие ресурсы. */
const MEDIA_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; sandbox";

/** Библиотека игр и стартовое состояние: миграция, выбор активной игры, уборка медиа. */
function openLibrary(opts: QuizServerOptions): { lib: GameLibrary; state: GameState } {
  const gamesDir = path.join(opts.dataDir, 'games');
  if (!fs.existsSync(gamesDir)) migrate({ dataDir: opts.dataDir, statePath: opts.statePath });
  const lib = new GameLibrary(gamesDir);

  const saved = readActiveGameId(opts.statePath);
  const usable = (id: string | null): id is string => id !== null && GAME_ID_RE.test(id) && lib.def(id) !== null;
  const id = usable(saved) ? saved
    : lib.entries().find((e) => 'def' in e)?.id ?? lib.create('Новая игра').id;
  const def = lib.def(id)!;
  let state = loadState(opts.statePath, def) ?? logic.initialState(id);
  if (state.activeGameId !== id) {
    if (fs.existsSync(opts.statePath)) {
      const entry = saved === null ? undefined : lib.get(saved);
      const reason = saved === null ? 'активная игра не указана'
        : entry && 'error' in entry ? `игра ${saved} повреждена (${entry.error})` : `игра ${saved} не найдена`;
      fs.copyFileSync(opts.statePath, opts.statePath + '.bak');
      console.warn(`[games] ${reason}; активна ${id}, прогресс сброшен, прежнее состояние сохранено как ${opts.statePath}.bak`);
    }
    state = logic.activateGame(state, id, def.scoring.startScore);
    saveState(opts.statePath, state);
  }
  for (const e of lib.entries()) {
    if (!('def' in e)) continue;
    try {
      lib.sweepMedia(e.id);
    } catch (err) {
      console.warn(`[games] ${e.id}: не удалось убрать лишние медиа (${(err as Error).message})`);
    }
  }
  return { lib, state };
}

export function createQuizServer(opts: QuizServerOptions) {
  const { lib, state: initial } = openLibrary(opts);
  let state: GameState = initial;
  const avatarsDir = path.join(opts.dataDir, 'media', 'avatars');
  const connections = new Map<string, Set<string>>();
  /** Активная игра всегда исправна: битую нельзя активировать, активную — удалить. */
  const active = (): ActiveGame => ({ id: state.activeGameId, def: lib.def(state.activeGameId)! });

  const app = express();
  app.post(
    '/api/games/:id/media',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.header('x-admin-pin') !== opts.pin) return void res.status(401).json({ error: 'UNAUTHORIZED' });
      if (typeof findGame(lib, req.params.id) === 'string') return void res.status(404).json({ error: 'NOT_FOUND' });
      next();
    },
    express.raw({ type: () => true, limit: '20mb' }),
    (req: express.Request, res: express.Response) => {
      const body: unknown = req.body;
      const media = Buffer.isBuffer(body) && body.length > 0 ? detectMedia(body) : null;
      if (!media) return void res.status(415).json({ error: 'UNSUPPORTED_TYPE' });
      const bytes = body as Buffer;
      if (bytes.length > MAX_MEDIA_BYTES[media.kind]) return void res.status(413).json({ error: 'TOO_LARGE' });
      const id = req.params.id;
      const file = `${randomUUID()}.${media.ext}`;
      try {
        fs.mkdirSync(lib.mediaDir(id), { recursive: true });
        fs.writeFileSync(path.join(lib.mediaDir(id), file), bytes);
      } catch {
        return void res.status(500).json({ error: 'SAVE_FAILED' });
      }
      res.json({ file, url: mediaUrl(id, file) });
    },
    (err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'TOO_LARGE' });
      next(err);
    },
  );
  app.get('/games/:id/media/:file', (req: express.Request, res: express.Response) => {
    const { id, file } = req.params;
    const notFound = () => void res.status(404).json({ error: 'NOT_FOUND' });
    if (!GAME_ID_RE.test(id) || !lib.get(id)) return notFound();
    if (file !== path.basename(file) || file.includes('\\') || file.startsWith('.')) return notFound();
    res.setHeader('Content-Security-Policy', MEDIA_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file, { root: lib.mediaDir(id), dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) notFound();
    });
  });
  app.use('/media/avatars', express.static(avatarsDir));
  if (opts.clientDist && fs.existsSync(opts.clientDist)) {
    const dist = opts.clientDist;
    app.use(express.static(dist));
    app.get(['/screen', '/admin'], (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  const httpServer = http.createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    maxHttpBufferSize: 2 * 1024 * 1024,
  });

  function deleteAvatarFile(url: string | undefined): void {
    if (!url) return;
    try {
      fs.rmSync(path.join(avatarsDir, path.basename(url)), { force: true });
    } catch { /* best effort */ }
  }

  const avatarsOf = (ids: string[]) =>
    state.players.filter((pl) => ids.includes(pl.id)).map((pl) => pl.avatar);

  function sendAdmin(socket: QuizSocket): void {
    const games = lib.entries().map((e) => summarize(e, state.activeGameId));
    const editingId = socket.data.editingId;
    const def = editingId ? lib.def(editingId) : null;
    if (!def) socket.data.editingId = undefined;
    const editing = editingId && def ? editView(state, { id: editingId, def }, state.activeGameId) : null;
    socket.emit('state:admin', toAdminView(state, active(), opts.joinUrl, games, editing));
  }

  /** У каждого админ-сокета своя открытая в редакторе игра, поэтому — по одному. */
  function emitAdmins(): void {
    for (const s of io.sockets.sockets.values()) if (s.data.isAdmin) sendAdmin(s);
  }

  function emitAll(): void {
    const game = active();
    io.emit('state:public', toPublicView(state, game, opts.joinUrl));
    emitAdmins();
    for (const id of connections.keys()) io.to(playerRoom(id)).emit('player:trophies', trophiesOf(state, game, id));
  }

  /** Сохраняет и рассылает; при ошибке записи state.json состояние в памяти не меняется. */
  function commit(next: GameState): boolean {
    try {
      saveState(opts.statePath, next);
    } catch (e) {
      console.warn(`[state] не удалось записать ${opts.statePath}: ${(e as Error).message}`);
      return false;
    }
    state = next;
    emitAll();
    return true;
  }

  /** После правки игры в библиотеке: активная видна всем, остальные — только админам. */
  function changed(gameId: string): void {
    if (gameId === state.activeGameId) emitAll();
    else emitAdmins();
  }

  /** Возвращает true, если состояние применено и сохранено. */
  function apply(result: Result, ack: AckFn): boolean {
    const done = result.ok && commit(result.state);
    ack(done ? { ok: true } : result.ok ? fail('SAVE_FAILED') : result);
    return done;
  }

  /** Binds socket to player; returns state with online updated on 0→1. */
  function bind(socket: QuizSocket, playerId: string, s: GameState): GameState {
    socket.data.playerId = playerId;
    socket.join(playerRoom(playerId));
    let set = connections.get(playerId);
    if (!set) connections.set(playerId, (set = new Set()));
    set.add(socket.id);
    socket.emit('player:trophies', trophiesOf(s, active(), playerId));
    return set.size === 1 ? logic.setOnline(s, playerId, true) : s;
  }

  /** Unbinds socket from its player; returns state with online updated on 1→0. */
  function unbind(socket: QuizSocket, s: GameState): GameState {
    const playerId = socket.data.playerId;
    if (!playerId) return s;
    socket.data.playerId = undefined;
    socket.leave(playerRoom(playerId));
    const set = connections.get(playerId);
    if (!set) return s;
    set.delete(socket.id);
    if (set.size > 0) return s;
    connections.delete(playerId);
    return logic.setOnline(s, playerId, false);
  }

  function evict(playerIds: string[]): void {
    for (const id of playerIds) {
      io.to(playerRoom(id)).emit('player:removed');
      for (const sid of connections.get(id) ?? []) {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.leave(playerRoom(id));
          s.data.playerId = undefined;
        }
      }
      connections.delete(id);
    }
  }

  io.on('connection', (socket: QuizSocket) => {
    // Bind from handshake so events buffered offline (e.g. a buzz) count before player:resume arrives.
    const authId = obj(socket.handshake.auth).playerId;
    const bound = typeof authId === 'string' && logic.hasPlayer(state, authId) ? bind(socket, authId, state) : state;
    // A successful commit broadcasts to this socket too.
    if (bound === state || !commit(bound)) socket.emit('state:public', toPublicView(state, active(), opts.joinUrl));

    socket.on('player:join', (p, ack) => {
      const reply = ackOf(ack);
      const name = String(obj(p).name ?? '');
      const reg = logic.registerPlayer(state, name, randomUUID(), active().def.scoring.startScore);
      if (!reg.ok) return reply(reg);
      if (!commit(bind(socket, reg.player.id, unbind(socket, reg.state)))) {
        unbind(socket, state);
        return reply(fail('SAVE_FAILED'));
      }
      reply({ ok: true, playerId: reg.player.id });
    });

    socket.on('player:resume', (p, ack) => {
      const reply = ackOf(ack);
      const id = obj(p).playerId;
      if (typeof id !== 'string' || !logic.hasPlayer(state, id)) return reply({ ok: false });
      if (socket.data.playerId !== id) {
        const next = bind(socket, id, unbind(socket, state));
        if (next !== state) commit(next);
      }
      reply({ ok: true });
    });

    socket.on('player:buzz', () => {
      const id = socket.data.playerId;
      if (id) apply(logic.buzz(state, id), noop);
    });

    socket.on('player:setAvatar', (p, ack) => {
      const reply = ackOf(ack);
      const id = socket.data.playerId;
      const me = id ? state.players.find((pl) => pl.id === id) : undefined;
      if (!id || !me) return reply(fail('NOT_FOUND'));
      const image = obj(p).image;
      if (image === null) {
        if (apply(setAvatar(state, id, undefined), reply)) deleteAvatarFile(me.avatar);
        return;
      }
      const bytes = Buffer.isBuffer(image) || image instanceof Uint8Array ? image
        : image instanceof ArrayBuffer ? new Uint8Array(image) : null;
      const ext = bytes && bytes.length > 0 && bytes.length <= MAX_AVATAR_BYTES ? imageExt(bytes) : null;
      if (!bytes || !ext) return reply(fail('INVALID_IMAGE'));
      const name = `${randomUUID()}.${ext}`;
      try {
        fs.mkdirSync(avatarsDir, { recursive: true });
        fs.writeFileSync(path.join(avatarsDir, name), bytes);
      } catch {
        deleteAvatarFile(`/media/avatars/${name}`);
        return reply(fail('INVALID_IMAGE'));
      }
      const done = apply(setAvatar(state, id, `/media/avatars/${name}`), reply);
      deleteAvatarFile(done ? me.avatar : `/media/avatars/${name}`);
    });

    socket.on('screen:hello', () => {
      socket.join('screen');
    });

    socket.on('admin:auth', (p, ack) => {
      const reply = ackOf(ack);
      if (obj(p).pin !== opts.pin) return reply(fail('UNAUTHORIZED'));
      socket.data.isAdmin = true;
      socket.join('admin');
      reply({ ok: true });
      sendAdmin(socket);
    });

    /**
     * Registers an admin-only handler; `run` gets the first argument as payload.
     * Side effects passed to `after` run only once the new state is saved.
     */
    const onAdmin = (
      event: keyof ClientToServerEvents,
      run: (p: Record<string, unknown>, after: (fn: () => void) => void) => Result,
    ) => {
      (socket.on as (e: string, h: (...a: unknown[]) => void) => void)(event, (...args) => {
        const reply = ackOf(args[args.length - 1]);
        if (!socket.data.isAdmin) return reply(fail('UNAUTHORIZED'));
        const effects: (() => void)[] = [];
        if (apply(run(obj(args[0]), (fn) => effects.push(fn)), reply)) effects.forEach((fn) => fn());
      });
    };

    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    onAdmin('admin:startGame', () => logic.startGame(state, active().def));
    onAdmin('admin:selectRound', (p) => logic.selectRound(state, active().def, p.index as number));
    onAdmin('admin:openQuestion', (p) =>
      typeof p.id === 'string' ? logic.openQuestion(state, active().def, p.id)
        : state.phase !== 'game' ? fail('WRONG_PHASE') : fail('NOT_FOUND'));
    onAdmin('admin:correct', () => logic.judgeCorrect(state, active().def));
    onAdmin('admin:wrong', () => logic.judgeWrong(state, active().def));
    onAdmin('admin:partial', (p) => logic.judgePartial(state, p.points as number));
    onAdmin('admin:close', () => logic.closeQuestion(state));
    onAdmin('admin:adjustScore', (p) => logic.adjustScore(state, p.playerId as string, p.delta as number));
    onAdmin('admin:removePlayer', (p, after) => {
      const avatars = avatarsOf([p.playerId as string]);
      after(() => {
        evict([p.playerId as string]);
        avatars.forEach(deleteAvatarFile);
      });
      return logic.removePlayer(state, p.playerId as string);
    });
    onAdmin('admin:newGame', (p, after) => {
      const removing = p.removePlayers === true;
      if (removing) {
        const ids = state.players.map((pl) => pl.id);
        const avatars = avatarsOf(ids);
        after(() => {
          evict(ids);
          avatars.forEach(deleteAvatarFile);
        });
      }
      const startScore = active().def.scoring.startScore;
      return { ok: true, state: logic.newGame(state, { removePlayers: removing, startScore }) };
    });
    onAdmin('admin:clearAvatar', (p, after) => {
      const id = str(p.playerId);
      if (id === null) return fail('NOT_FOUND');
      const avatar = state.players.find((pl) => pl.id === id)?.avatar;
      after(() => deleteAvatarFile(avatar));
      return setAvatar(state, id, undefined);
    });

    onAdmin('admin:shopOpen', (p) => shop.setShopOpen(state, p.open === true));
    onAdmin('admin:cancelPurchase', (p) => {
      const id = str(p.purchaseId);
      return id === null ? fail('NOT_FOUND') : shop.cancelPurchase(state, id);
    });
    (socket.on as (e: string, h: (...a: unknown[]) => void) => void)('admin:sell', (...args) => {
      const reply = ackOf(args[args.length - 1]);
      if (!socket.data.isAdmin) return reply(fail('UNAUTHORIZED'));
      const p = obj(args[0]);
      const itemId = str(p.itemId);
      const playerId = str(p.playerId);
      if (itemId === null || playerId === null) return reply(fail('NOT_FOUND'));
      const purchaseId = randomUUID();
      const game = active();
      const item = game.def.shop.find((i) => i.id === itemId);
      const buyer = state.players.find((pl) => pl.id === playerId);
      const result = shop.sellItem(state, game.def.shop, itemId, playerId, purchaseId, Date.now());
      if (result.ok && item && buyer) {
        io.to('screen').emit('shop:purchased', {
          purchaseId, playerName: buyer.name, ...(buyer.avatar && { playerAvatar: buyer.avatar }),
          item: clientItem(game.id, item),
        });
      }
      apply(result, reply);
    });

    (socket.on as (e: string, h: (...a: unknown[]) => void) => void)('admin:audio', (...args) => {
      const reply = ackOf(args[args.length - 1]);
      if (!socket.data.isAdmin) return reply(fail('UNAUTHORIZED'));
      const action = obj(args[0]).action as AudioAction;
      if (!AUDIO_ACTIONS.includes(action)) return reply(fail('NOT_FOUND'));
      io.to('screen').emit('screen:audio', { action });
      reply({ ok: true });
    });

    registerGameHandlers(socket, { lib, state: () => state, commit, changed, sendAdmin });

    socket.on('disconnect', () => {
      const next = unbind(socket, state);
      if (next !== state) commit(next);
    });
  });

  return {
    httpServer,
    io,
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}
