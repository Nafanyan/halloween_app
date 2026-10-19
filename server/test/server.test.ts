import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';
import type { AdminView, ClientToServerEvents, PublicView, ServerToClientEvents } from '@quiz/shared';
import { createQuizServer } from '../src/server';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
type Server = ReturnType<typeof createQuizServer>;

const PIN = '4321';
const TIMEOUT = 2000;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(96, 1)]);
const AVATAR_URL = /^\/media\/avatars\/[0-9a-f-]{36}\.jpg$/;

let dir: string;
let questionsPath: string;
let mediaDir: string;
let statePath: string;
let servers: Server[];
let clients: Client[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-server-'));
  questionsPath = path.join(dir, 'questions.json');
  mediaDir = path.join(dir, 'media');
  statePath = path.join(dir, 'state.json');
  fs.mkdirSync(mediaDir);
  fs.writeFileSync(questionsPath, JSON.stringify({
    rounds: [{ name: 'Раунд 1', themes: [{ name: 'Тема', questions: [
      { value: 100, text: 'Вопрос один', answer: 'СЕКРЕТНЫЙ-ОТВЕТ' },
      { value: 200, text: 'Вопрос два', answer: 'Ответ два' },
    ] }] }],
  }));
  servers = [];
  clients = [];
});

afterEach(async () => {
  for (const c of clients) c.disconnect();
  await Promise.all(servers.map((s) => s.close()));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function start(): Promise<string> {
  const server = createQuizServer({ questionsPath, mediaDir, statePath, pin: PIN, joinUrl: 'http://test/' });
  servers.push(server);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  return `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
}

function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${what}`)), TIMEOUT)),
  ]);
}

/** Connects and resolves after the initial state:public arrives. */
async function connect(url: string): Promise<Client> {
  const c: Client = ioc(url, { forceNew: true, transports: ['websocket'] });
  clients.push(c);
  await nextEvent(c, 'state:public');
  return c;
}

function nextEvent<E extends keyof ServerToClientEvents>(
  c: Client, event: E, pred: (...a: Parameters<ServerToClientEvents[E]>) => boolean = () => true,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return withTimeout(new Promise((resolve) => {
    const h = (...a: any[]) => {
      if (!(pred as any)(...a)) return;
      c.off(event, h as any);
      resolve(a[0]);
    };
    c.on(event, h as any);
  }), `event ${event}`);
}

function call(c: Client, event: string, ...args: unknown[]): Promise<any> {
  return withTimeout(new Promise((resolve) => (c.emit as any)(event, ...args, resolve)), `ack ${event}`);
}

async function admin(url: string): Promise<Client> {
  const a = await connect(url);
  expect(await call(a, 'admin:auth', { pin: PIN })).toEqual({ ok: true });
  return a;
}

async function player(url: string, name: string): Promise<{ c: Client; id: string }> {
  const c = await connect(url);
  const r = await call(c, 'player:join', { name });
  expect(r.ok).toBe(true);
  return { c, id: r.playerId };
}

describe('quiz server', () => {
  it('exactly one buzz wins', async () => {
    const url = await start();
    const players = await Promise.all([1, 2, 3, 4, 5].map((i) => player(url, `Игрок ${i}`)));
    const a = await admin(url);
    expect(await call(a, 'admin:startGame')).toEqual({ ok: true });
    expect(await call(a, 'admin:openQuestion', { id: '0/0/0' })).toEqual({ ok: true });

    const views = players.map(({ c }) =>
      nextEvent(c, 'state:public', (v: PublicView) => v.activeQuestion?.answeringPlayerId != null));
    for (const { c } of players) c.emit('player:buzz');
    const got = await Promise.all(views);

    const winner = got[0].activeQuestion!.answeringPlayerId;
    expect(players.map((p) => p.id)).toContain(winner);
    for (const v of got) expect(v.activeQuestion!.answeringPlayerId).toBe(winner);
  });

  it('admin events need auth', async () => {
    const url = await start();
    const c = await connect(url);
    expect(await call(c, 'admin:startGame')).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(await call(c, 'admin:auth', { pin: '0000' })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(await call(c, 'admin:startGame')).toEqual({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('answer never reaches public', async () => {
    const url = await start();
    const { c } = await player(url, 'Игрок');
    const a = await admin(url);
    await call(a, 'admin:startGame');

    const pub = nextEvent(c, 'state:public', (v: PublicView) => v.activeQuestion !== null);
    const adm = nextEvent(a, 'state:admin', (v: AdminView) => v.activeQuestion !== null);
    expect(await call(a, 'admin:openQuestion', { id: '0/0/0' })).toEqual({ ok: true });

    expect(JSON.stringify(await pub)).not.toContain('СЕКРЕТНЫЙ-ОТВЕТ');
    expect((await adm).activeQuestion!.answer).toBe('СЕКРЕТНЫЙ-ОТВЕТ');
  });

  it('two tabs', async () => {
    const url = await start();
    const { c: first, id } = await player(url, 'Игрок');
    const second = await connect(url);
    expect(await call(second, 'player:resume', { playerId: id })).toEqual({ ok: true });
    const observer = await connect(url);
    const online = (v: PublicView) => v.players.find((p) => p.id === id)?.online;

    // Disconnecting one tab must not broadcast offline; prove it via a later observable change.
    const afterFirst = nextEvent(observer, 'state:public');
    first.disconnect();
    const a = await admin(url);
    await call(a, 'admin:adjustScore', { playerId: id, delta: 5 });
    expect(online(await afterFirst)).toBe(true);

    const offline = nextEvent(observer, 'state:public', (v: PublicView) => online(v) === false);
    second.disconnect();
    expect(online(await offline)).toBe(false);
  });

  it('removed player', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const a = await admin(url);
    const removed = nextEvent(c, 'player:removed');
    expect(await call(a, 'admin:removePlayer', { playerId: id })).toEqual({ ok: true });
    await removed;
    expect(await call(c, 'player:resume', { playerId: id })).toEqual({ ok: false });
  });

  it('state survives restart', async () => {
    const url = await start();
    const { id } = await player(url, 'Игрок');
    const a = await admin(url);
    expect(await call(a, 'admin:adjustScore', { playerId: id, delta: 300 })).toEqual({ ok: true });
    for (const c of clients.splice(0)) c.disconnect();
    await servers.pop()!.close();

    const url2 = await start();
    const c: Client = ioc(url2, { forceNew: true, transports: ['websocket'] });
    clients.push(c);
    const v = await nextEvent(c, 'state:public');
    expect(v.players).toEqual([{ id, name: 'Игрок', score: 300, online: false }]);
  });

  it('survives malformed payloads and missing acks', async () => {
    const url = await start();
    const c = await connect(url);
    (c.emit as any)('player:join', null);
    (c.emit as any)('player:join', 'oops', 'not-a-fn');
    (c.emit as any)('player:resume');
    (c.emit as any)('admin:auth', 42);
    (c.emit as any)('admin:startGame');
    c.emit('player:buzz');
    const a = await admin(url);
    expect(await call(a, 'admin:openQuestion', { id: 7 })).toEqual({ ok: false, error: 'WRONG_PHASE' });
    await call(a, 'admin:startGame');
    expect(await call(a, 'admin:openQuestion', { id: 7 })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await call(c, 'player:join', { name: 'Жив' })).toMatchObject({ ok: true });
  });

  it('handshake auth binds before any event so an early buzz is accepted', async () => {
    const url = await start();
    const { c: joined, id } = await player(url, 'Игрок');
    joined.disconnect();
    const a = await admin(url);
    await call(a, 'admin:startGame');
    expect(await call(a, 'admin:openQuestion', { id: '0/0/0' })).toEqual({ ok: true });

    const answered = nextEvent(a, 'state:admin', (v: AdminView) => v.activeQuestion?.answeringPlayerId != null);
    const c: Client = ioc(url, { forceNew: true, transports: ['websocket'], auth: { playerId: id } });
    clients.push(c);
    c.emit('player:buzz');
    expect((await answered).activeQuestion!.answeringPlayerId).toBe(id);
  });

  it('handshake auth with unknown id does not bind', async () => {
    const url = await start();
    const { c: real, id } = await player(url, 'Игрок');
    const a = await admin(url);
    await call(a, 'admin:startGame');
    expect(await call(a, 'admin:openQuestion', { id: '0/0/0' })).toEqual({ ok: true });

    const c: Client = ioc(url, { forceNew: true, transports: ['websocket'], auth: { playerId: 'nope' } });
    clients.push(c);
    c.emit('player:buzz');
    // Same-socket events are handled in order: once this ack arrives, the buzz was processed.
    expect(await call(c, 'player:resume', { playerId: 'nope' })).toEqual({ ok: false });

    const answered = nextEvent(a, 'state:admin', (v: AdminView) => v.activeQuestion?.answeringPlayerId != null);
    real.emit('player:buzz');
    expect((await answered).activeQuestion!.answeringPlayerId).toBe(id);
  });

  it('relays admin:audio to screen room', async () => {
    const url = await start();
    const screen = await connect(url);
    screen.emit('screen:hello');
    const a = await admin(url);
    const audio = nextEvent(screen, 'screen:audio');
    expect(await call(a, 'admin:audio', { action: 'pause' })).toEqual({ ok: true });
    expect(await audio).toEqual({ action: 'pause' });
  });

  describe('shop', () => {
    const SECRET = 'ТАЙНЫЙ-ПРЕДМЕТ-QWE';
    const item = { name: SECRET, description: 'д', price: 300, quantity: 2, hidden: true };

    async function setupSale(url: string) {
      const screen = await connect(url);
      screen.emit('screen:hello');
      const buyer = await player(url, 'Покупатель');
      const other = await player(url, 'Другой');
      const a = await admin(url);
      await call(a, 'admin:startGame');
      await call(a, 'admin:adjustScore', { playerId: buyer.id, delta: 500 });
      const added = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 1);
      expect(await call(a, 'admin:itemAdd', { item })).toEqual({ ok: true });
      const view = await added;
      return { screen, buyer, other, a, itemId: view.shop.items[0].id };
    }

    it('sell: purchased goes to screen only; trophies to buyer only', async () => {
      const url = await start();
      const { screen, buyer, other, a, itemId } = await setupSale(url);
      expect(await call(buyer.c, 'player:setAvatar', { image: JPEG })).toEqual({ ok: true });
      const seen: string[] = [];
      other.c.on('shop:purchased', (p) => seen.push(JSON.stringify(p)));
      other.c.on('player:trophies', (t) => seen.push(JSON.stringify(t)));
      other.c.on('state:public', (v) => seen.push(JSON.stringify(v)));
      const buyerGot: unknown[] = [];
      buyer.c.on('shop:purchased', (p) => buyerGot.push(p));
      const onScreen = nextEvent(screen, 'shop:purchased');
      const trophies = nextEvent(buyer.c, 'player:trophies', (t) => t.length === 1);

      expect(await call(a, 'admin:sell', { itemId, playerId: buyer.id })).toEqual({ ok: true });

      const ev = await onScreen;
      expect(ev.playerName).toBe('Покупатель');
      expect(ev.playerAvatar).toMatch(AVATAR_URL);
      expect(ev.item.name).toBe(SECRET);
      const t = await trophies;
      expect(t[0]).toEqual({ purchaseId: ev.purchaseId, item: ev.item });

      await new Promise((r) => setTimeout(r, 300));
      expect(buyerGot).toEqual([]);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen.join('')).not.toContain(SECRET);
      expect(seen.some((x) => x.includes(ev.purchaseId))).toBe(false);
    });

    it('trophies are sent on resume', async () => {
      const url = await start();
      const { buyer, a, itemId } = await setupSale(url);
      expect(await call(a, 'admin:sell', { itemId, playerId: buyer.id })).toEqual({ ok: true });
      const c: Client = ioc(url, { forceNew: true, transports: ['websocket'], auth: { playerId: buyer.id } });
      clients.push(c);
      const t = await nextEvent(c, 'player:trophies', (x) => x.length === 1);
      expect(t[0].item.name).toBe(SECRET);
    });

    it('shop admin events need auth', async () => {
      const url = await start();
      const c = await connect(url);
      expect(await call(c, 'admin:itemAdd', { item })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
      expect(await call(c, 'admin:shopOpen', { open: true })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
      expect(await call(c, 'admin:sell', { itemId: 'x', playerId: 'y' })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    });

    it('openQuestion closes the shop for everyone', async () => {
      const url = await start();
      const { c } = await player(url, 'Игрок');
      const a = await admin(url);
      await call(a, 'admin:startGame');
      const opened = nextEvent(c, 'state:public', (v: PublicView) => v.shop.open);
      expect(await call(a, 'admin:shopOpen', { open: true })).toEqual({ ok: true });
      await opened;
      const closed = nextEvent(c, 'state:public', (v: PublicView) => !v.shop.open);
      expect(await call(a, 'admin:openQuestion', { id: '0/0/0' })).toEqual({ ok: true });
      await closed;
    });

    it('non-string ids give NOT_FOUND', async () => {
      const url = await start();
      const a = await admin(url);
      expect(await call(a, 'admin:itemDelete', { id: 5 })).toEqual({ ok: false, error: 'NOT_FOUND' });
      expect(await call(a, 'admin:cancelPurchase', {})).toEqual({ ok: false, error: 'NOT_FOUND' });
    });
  });
});

describe('shop image upload', () => {
  const post = (url: string, body: Buffer, headers: Record<string, string>) =>
    fetch(`${url}/api/shop/image`, { method: 'POST', body: new Uint8Array(body), headers });

  it('upload: saves image and serves it under /media/shop', async () => {
    const url = await start();
    const bytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const res = await post(url, bytes, { 'X-Admin-Pin': PIN, 'Content-Type': 'image/png' });
    expect(res.status).toBe(200);
    const { url: imageUrl } = await res.json() as { url: string };
    expect(imageUrl).toMatch(/^\/media\/shop\/[0-9a-f-]+\.png$/);
    const got = await fetch(`${url}${imageUrl}`);
    expect(got.status).toBe(200);
    expect(Buffer.from(await got.arrayBuffer())).toEqual(bytes);
  });

  it('upload: wrong PIN → 401, nothing written', async () => {
    const url = await start();
    const res = await post(url, Buffer.from([1]), { 'X-Admin-Pin': 'bad', 'Content-Type': 'image/png' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
    const shopDir = path.join(mediaDir, 'shop');
    expect(fs.existsSync(shopDir) ? fs.readdirSync(shopDir) : []).toEqual([]);
  });

  it('upload: text/plain → 415', async () => {
    const url = await start();
    const res = await post(url, Buffer.from('hi'), { 'X-Admin-Pin': PIN, 'Content-Type': 'text/plain' });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'UNSUPPORTED_TYPE' });
  });

  it('upload: 6 MB → 413', async () => {
    const url = await start();
    const res = await post(url, Buffer.alloc(6 * 1024 * 1024), { 'X-Admin-Pin': PIN, 'Content-Type': 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'TOO_LARGE' });
  });
});

describe('avatars', () => {
  const fileOf = (url: string) => path.join(mediaDir, 'avatars', path.basename(url));
  const avatarOf = (v: PublicView, id: string) => v.players.find((p) => p.id === id)?.avatar;

  async function upload(c: Client, id: string, observer: Client = c): Promise<string> {
    const next = nextEvent(observer, 'state:public', (v: PublicView) => avatarOf(v, id) !== undefined);
    expect(await call(c, 'player:setAvatar', { image: JPEG })).toEqual({ ok: true });
    return avatarOf(await next, id)!;
  }

  it('upload: writes file, avatar in public view', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const avatar = await upload(c, id);
    expect(avatar).toMatch(AVATAR_URL);
    expect(fs.existsSync(fileOf(avatar))).toBe(true);
    expect((await fetch(url + avatar)).status).toBe(200);
  });

  it('replace deletes old file; null clears and deletes', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const first = await upload(c, id);
    const next = nextEvent(c, 'state:public', (v: PublicView) => {
      const x = avatarOf(v, id);
      return x !== undefined && x !== first;
    });
    expect(await call(c, 'player:setAvatar', { image: JPEG })).toEqual({ ok: true });
    const second = avatarOf(await next, id)!;
    expect(fs.existsSync(fileOf(first))).toBe(false);
    expect(fs.existsSync(fileOf(second))).toBe(true);

    const cleared = nextEvent(c, 'state:public', (v: PublicView) => avatarOf(v, id) === undefined);
    expect(await call(c, 'player:setAvatar', { image: null })).toEqual({ ok: true });
    await cleared;
    expect(fs.existsSync(fileOf(second))).toBe(false);
  });

  it('> 1 MB → INVALID_IMAGE, nothing written', async () => {
    const url = await start();
    const { c } = await player(url, 'Игрок');
    const big = Buffer.alloc(1_048_577, 1);
    JPEG.copy(big);
    expect(await call(c, 'player:setAvatar', { image: big })).toEqual({ ok: false, error: 'INVALID_IMAGE' });
    const dir = path.join(mediaDir, 'avatars');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it('not an image / not binary → INVALID_IMAGE', async () => {
    const url = await start();
    const { c } = await player(url, 'Игрок');
    for (const image of [Uint8Array.from([1, 2, 3]), Buffer.alloc(0), 'abc', 42, undefined]) {
      expect(await call(c, 'player:setAvatar', { image })).toEqual({ ok: false, error: 'INVALID_IMAGE' });
    }
    expect(await call(c, 'player:setAvatar', {})).toEqual({ ok: false, error: 'INVALID_IMAGE' });
  });

  it('disk write failure → INVALID_IMAGE, server keeps answering', async () => {
    const url = await start();
    const { c } = await player(url, 'Игрок');
    fs.writeFileSync(path.join(mediaDir, 'avatars'), 'not a dir');
    expect(await call(c, 'player:setAvatar', { image: JPEG })).toEqual({ ok: false, error: 'INVALID_IMAGE' });
    expect(await call(c, 'player:setAvatar', { image: null })).toEqual({ ok: true });
  });

  it('unbound socket → NOT_FOUND, nothing written', async () => {
    const url = await start();
    const c = await connect(url);
    expect(await call(c, 'player:setAvatar', { image: JPEG })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(fs.existsSync(path.join(mediaDir, 'avatars'))).toBe(false);
  });

  it('admin:clearAvatar deletes file; needs auth', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const avatar = await upload(c, id);
    expect(await call(c, 'admin:clearAvatar', { playerId: id })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(fs.existsSync(fileOf(avatar))).toBe(true);
    const a = await admin(url);
    expect(await call(a, 'admin:clearAvatar', { playerId: 'nope' })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await call(a, 'admin:clearAvatar', { playerId: 5 })).toEqual({ ok: false, error: 'NOT_FOUND' });
    const cleared = nextEvent(c, 'state:public', (v: PublicView) => avatarOf(v, id) === undefined);
    expect(await call(a, 'admin:clearAvatar', { playerId: id })).toEqual({ ok: true });
    await cleared;
    expect(fs.existsSync(fileOf(avatar))).toBe(false);
  });

  it('removePlayer deletes avatar file', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const avatar = await upload(c, id);
    const a = await admin(url);
    expect(await call(a, 'admin:removePlayer', { playerId: id })).toEqual({ ok: true });
    expect(fs.existsSync(fileOf(avatar))).toBe(false);
  });

  it('newGame keeps avatars; newGame with removePlayers deletes files', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const avatar = await upload(c, id);
    const a = await admin(url);
    expect(await call(a, 'admin:newGame', {})).toEqual({ ok: true });
    expect(fs.existsSync(fileOf(avatar))).toBe(true);
    expect(await call(a, 'admin:newGame', { removePlayers: true })).toEqual({ ok: true });
    expect(fs.existsSync(fileOf(avatar))).toBe(false);
  });

  it('avatar survives restart', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const avatar = await upload(c, id);
    for (const x of clients.splice(0)) x.disconnect();
    await servers.pop()!.close();

    const url2 = await start();
    const c2: Client = ioc(url2, { forceNew: true, transports: ['websocket'] });
    clients.push(c2);
    expect(avatarOf(await nextEvent(c2, 'state:public'), id)).toBe(avatar);
    expect((await fetch(url2 + avatar)).status).toBe(200);
  });
});
