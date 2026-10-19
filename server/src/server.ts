import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type {
  AudioAction, ClientToServerEvents, ErrorCode, GameState, Result, ServerToClientEvents,
} from '@quiz/shared';
import { loadQuestions } from './questions';
import { loadState, saveState } from './persistence';
import { toAdminView, toPublicView, trophiesOf } from './views';
import * as logic from './game/logic';
import * as shop from './game/shop';
import { imageExt, setAvatar } from './game/avatar';

export interface QuizServerOptions {
  questionsPath: string; mediaDir: string; statePath: string;
  pin: string; joinUrl: string; clientDist?: string;
}

interface SocketData { isAdmin?: boolean; playerId?: string }
type QuizSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AckFn = (r: unknown) => void;

const AUDIO_ACTIONS: AudioAction[] = ['play', 'pause', 'restart'];
const noop: AckFn = () => {};
const ackOf = (v: unknown): AckFn => (typeof v === 'function' ? (v as AckFn) : noop);
const fail = (error: ErrorCode) => ({ ok: false as const, error });
const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? v as Record<string, unknown> : {});
const IMAGE_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const mediaType = (header: string | undefined) => (header ?? '').split(';')[0].trim().toLowerCase();
const MAX_AVATAR_BYTES = 1024 * 1024;
const playerRoom = (id: string) => `player:${id}`;

export function createQuizServer(opts: QuizServerOptions) {
  const pack = loadQuestions(opts.questionsPath, opts.mediaDir);
  let state: GameState = loadState(opts.statePath, pack) ?? logic.initialState();
  const connections = new Map<string, Set<string>>();

  const app = express();
  app.post(
    '/api/shop/image',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.header('x-admin-pin') !== opts.pin) return void res.status(401).json({ error: 'UNAUTHORIZED' });
      if (!(mediaType(req.header('content-type')) in IMAGE_EXT)) {
        return void res.status(415).json({ error: 'UNSUPPORTED_TYPE' });
      }
      next();
    },
    express.raw({ type: Object.keys(IMAGE_EXT), limit: '5mb' }),
    (req: express.Request, res: express.Response) => {
      const body: unknown = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) return void res.status(415).json({ error: 'UNSUPPORTED_TYPE' });
      const dir = path.join(opts.mediaDir, 'shop');
      fs.mkdirSync(dir, { recursive: true });
      const name = `${randomUUID()}.${IMAGE_EXT[mediaType(req.header('content-type'))]}`;
      fs.writeFileSync(path.join(dir, name), body);
      res.json({ url: `/media/shop/${name}` });
    },
    (err: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err.type === 'entity.too.large') return void res.status(413).json({ error: 'TOO_LARGE' });
      next(err);
    },
  );
  app.use('/media', express.static(opts.mediaDir));
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
      fs.rmSync(path.join(opts.mediaDir, 'avatars', path.basename(url)), { force: true });
    } catch { /* best effort */ }
  }

  const avatarsOf = (ids: string[]) =>
    state.players.filter((pl) => ids.includes(pl.id)).map((pl) => pl.avatar);

  function commit(next: GameState): void {
    state = next;
    saveState(opts.statePath, state);
    io.emit('state:public', toPublicView(state, pack, opts.joinUrl));
    io.to('admin').emit('state:admin', toAdminView(state, pack, opts.joinUrl));
    for (const id of connections.keys()) io.to(playerRoom(id)).emit('player:trophies', trophiesOf(state, id));
  }

  function apply(result: Result, ack: AckFn): void {
    if (!result.ok) return ack(result);
    commit(result.state);
    ack({ ok: true });
  }

  /** Binds socket to player; returns state with online updated on 0→1. */
  function bind(socket: QuizSocket, playerId: string, s: GameState): GameState {
    socket.data.playerId = playerId;
    socket.join(playerRoom(playerId));
    let set = connections.get(playerId);
    if (!set) connections.set(playerId, (set = new Set()));
    set.add(socket.id);
    socket.emit('player:trophies', trophiesOf(s, playerId));
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
    if (bound !== state) commit(bound); // broadcast includes this socket
    else socket.emit('state:public', toPublicView(state, pack, opts.joinUrl));

    socket.on('player:join', (p, ack) => {
      const reply = ackOf(ack);
      const reg = logic.registerPlayer(state, String(obj(p).name ?? ''), randomUUID());
      if (!reg.ok) return reply(reg);
      commit(bind(socket, reg.player.id, unbind(socket, reg.state)));
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
        const result = setAvatar(state, id, undefined);
        if (result.ok) deleteAvatarFile(me.avatar);
        return apply(result, reply);
      }
      const bytes = Buffer.isBuffer(image) || image instanceof Uint8Array ? image
        : image instanceof ArrayBuffer ? new Uint8Array(image) : null;
      const ext = bytes && bytes.length > 0 && bytes.length <= MAX_AVATAR_BYTES ? imageExt(bytes) : null;
      if (!bytes || !ext) return reply(fail('INVALID_IMAGE'));
      const name = `${randomUUID()}.${ext}`;
      const dir = path.join(opts.mediaDir, 'avatars');
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), bytes);
      } catch {
        deleteAvatarFile(`/media/avatars/${name}`);
        return reply(fail('INVALID_IMAGE'));
      }
      const result = setAvatar(state, id, `/media/avatars/${name}`);
      deleteAvatarFile(result.ok ? me.avatar : `/media/avatars/${name}`);
      apply(result, reply);
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
      socket.emit('state:admin', toAdminView(state, pack, opts.joinUrl));
    });

    /** Registers an admin-only handler; `run` gets the first argument as payload. */
    const onAdmin = (event: keyof ClientToServerEvents, run: (p: Record<string, unknown>) => Result) => {
      (socket.on as (e: string, h: (...a: unknown[]) => void) => void)(event, (...args) => {
        const reply = ackOf(args[args.length - 1]);
        if (!socket.data.isAdmin) return reply(fail('UNAUTHORIZED'));
        apply(run(obj(args[0])), reply);
      });
    };

    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    onAdmin('admin:startGame', () => logic.startGame(state));
    onAdmin('admin:selectRound', (p) => logic.selectRound(state, pack, p.index as number));
    onAdmin('admin:openQuestion', (p) =>
      typeof p.id === 'string' ? logic.openQuestion(state, pack, p.id)
        : state.phase !== 'game' ? fail('WRONG_PHASE') : fail('NOT_FOUND'));
    onAdmin('admin:correct', () => logic.judgeCorrect(state, pack));
    onAdmin('admin:wrong', () => logic.judgeWrong(state));
    onAdmin('admin:partial', (p) => logic.judgePartial(state, p.points as number));
    onAdmin('admin:close', () => logic.closeQuestion(state));
    onAdmin('admin:adjustScore', (p) => logic.adjustScore(state, p.playerId as string, p.delta as number));
    onAdmin('admin:removePlayer', (p) => {
      const avatars = avatarsOf([p.playerId as string]);
      const result = logic.removePlayer(state, p.playerId as string);
      if (result.ok) {
        evict([p.playerId as string]);
        avatars.forEach(deleteAvatarFile);
      }
      return result;
    });
    onAdmin('admin:newGame', (p) => {
      const removing = p.removePlayers === true;
      const avatars = removing ? avatarsOf(state.players.map((pl) => pl.id)) : [];
      if (removing) evict(state.players.map((pl) => pl.id));
      avatars.forEach(deleteAvatarFile);
      return { ok: true, state: logic.newGame(state, { removePlayers: removing }) };
    });
    onAdmin('admin:clearAvatar', (p) => {
      const id = str(p.playerId);
      if (id === null) return fail('NOT_FOUND');
      const avatar = state.players.find((pl) => pl.id === id)?.avatar;
      const result = setAvatar(state, id, undefined);
      if (result.ok) deleteAvatarFile(avatar);
      return result;
    });

    onAdmin('admin:shopOpen', (p) => shop.setShopOpen(state, p.open === true));
    onAdmin('admin:itemAdd', (p) => shop.addItem(state, p.item, randomUUID()));
    onAdmin('admin:itemUpdate', (p) => {
      const id = str(p.id);
      return id === null ? fail('NOT_FOUND') : shop.updateItem(state, id, p.item);
    });
    onAdmin('admin:itemDelete', (p) => {
      const id = str(p.id);
      return id === null ? fail('NOT_FOUND') : shop.deleteItem(state, id);
    });
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
      const item = state.shop.items.find((i) => i.id === itemId);
      const buyer = state.players.find((pl) => pl.id === playerId);
      const result = shop.sellItem(state, itemId, playerId, purchaseId, Date.now());
      if (result.ok && item && buyer) {
        io.to('screen').emit('shop:purchased', {
          purchaseId, playerName: buyer.name, ...(buyer.avatar && { playerAvatar: buyer.avatar }), item,
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
