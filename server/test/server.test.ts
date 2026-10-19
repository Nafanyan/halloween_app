import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
const views = new WeakMap<Client, PublicView>();
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
  const server = createQuizServer({ dataDir: dir, statePath, pin: PIN, joinUrl: 'http://test/' });
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
  views.set(c, await nextEvent(c, 'state:public'));
  return c;
}

/** Id of the game that was active when the client connected. */
const gameIdOf = (c: Client) => views.get(c)!.game.id;

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

/** Authenticates and resolves with the admin view sent right after auth. */
async function adminView(url: string): Promise<{ a: Client; view: AdminView }> {
  const a = await connect(url);
  const first = nextEvent(a, 'state:admin');
  expect(await call(a, 'admin:auth', { pin: PIN })).toEqual({ ok: true });
  return { a, view: await first };
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
      expect(await call(a, 'admin:itemAdd', { gameId: gameIdOf(a), item })).toEqual({ ok: true });
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
      expect(await call(c, 'admin:itemAdd', { gameId: gameIdOf(c), item })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
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
      expect(await call(a, 'admin:itemDelete', { gameId: gameIdOf(a), id: 5 })).toEqual({ ok: false, error: 'NOT_FOUND' });
      expect(await call(a, 'admin:itemDelete', { gameId: '../x', id: 'a' })).toEqual({ ok: false, error: 'NOT_FOUND' });
      expect(await call(a, 'admin:cancelPurchase', {})).toEqual({ ok: false, error: 'NOT_FOUND' });
    });
  });
});

const GAME_ID = /^g-[a-z0-9]{8}$/;
const gameJson = (id: string) => path.join(dir, 'games', id, 'game.json');
const readGame = (id: string) => JSON.parse(fs.readFileSync(gameJson(id), 'utf8'));
const postMedia = (url: string, id: string, body: Buffer, pin = PIN) =>
  fetch(`${url}/api/games/${id}/media`, { method: 'POST', body: new Uint8Array(body), headers: { 'X-Admin-Pin': pin } });

async function stop(): Promise<void> {
  for (const c of clients.splice(0)) c.disconnect();
  await servers.pop()!.close();
}

describe('game library', () => {
  it('start migrates legacy questions once', async () => {
    const url = await start();
    const v = views.get(await connect(url))!;
    expect(v.game.title).toBe('Сумеречный шабаш');
    expect(v.roundNames).toEqual(['Раунд 1']);
    expect(v.themes).toEqual([{ name: 'Тема', cells: [
      { id: '0/0/0', value: 100, played: false },
      { id: '0/0/1', value: 200, played: false },
    ] }]);

    await stop();
    const { view } = await adminView(await start());
    expect(view.games).toHaveLength(1);
    expect(view.game.id).toBe(v.game.id);
  });

  it('migration keeps players, scores and purchases', async () => {
    fs.writeFileSync(statePath, JSON.stringify({
      phase: 'game', players: [{ id: 'p1', name: 'Аня', score: 300, online: true }],
      playedCells: ['0/0/0'], currentRound: 0, activeQuestion: null,
      shop: {
        open: false,
        items: [{ id: 'i1', name: 'Метла', description: '', price: 100, quantity: 2, hidden: false }],
        purchases: [{ id: 'u1', itemId: 'i1', playerId: 'p1', price: 100, at: 1 }],
      },
    }));
    const url = await start();
    const { view } = await adminView(url);
    expect(view.phase).toBe('game');
    expect(view.players).toEqual([{ id: 'p1', name: 'Аня', score: 300, online: false }]);
    expect(view.themes[0].cells[0].played).toBe(true);
    expect(view.shop.items.map((i) => i.name)).toEqual(['Метла']);
    expect(view.shop.purchases).toMatchObject([{ id: 'u1', itemName: 'Метла', playerName: 'Аня' }]);
  });

  it('game:create', async () => {
    const url = await start();
    const c = await connect(url);
    expect(await call(c, 'game:create', { title: 'Новая' })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    const { a } = await adminView(url);
    const listed = nextEvent(a, 'state:admin', (v: AdminView) => v.games.length === 2);
    const r = await call(a, 'game:create', { title: 'Новая' });
    expect(r).toEqual({ ok: true, id: expect.stringMatching(GAME_ID) });
    expect((await listed).games.find((g) => g.id === r.id)).toMatchObject({ title: 'Новая', active: false });
    expect(readGame(r.id).title).toBe('Новая');
    for (const title of ['', '   ', 'я'.repeat(61), 5, undefined]) {
      expect(await call(a, 'game:create', { title })).toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    }
  });

  it('game:activate an empty game keeps players and resets to lobby', async () => {
    const url = await start();
    const { c, id } = await player(url, 'Игрок');
    const { a } = await adminView(url);
    await call(a, 'admin:startGame');
    await call(a, 'admin:adjustScore', { playerId: id, delta: 300 });
    const { id: gid } = await call(a, 'game:create', { title: 'Новая' });
    const pub = nextEvent(c, 'state:public', (v: PublicView) => v.game.id === gid);
    expect(await call(a, 'game:activate', { id: gid })).toEqual({ ok: true });
    const v = await pub;
    expect(v.game.title).toBe('Новая');
    expect(v.phase).toBe('lobby');
    expect(v.players).toEqual([{ id, name: 'Игрок', score: 0, online: true }]);
    expect(await call(a, 'admin:startGame')).toEqual({ ok: false, error: 'NO_QUESTIONS' });
    expect(await call(a, 'game:activate', { id: 'g-zzzzzzzz' })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await call(c, 'game:activate', { id: gid })).toEqual({ ok: false, error: 'UNAUTHORIZED' });
  });

  it('game:delete: refuses the active game; removes another and closes its editor', async () => {
    const url = await start();
    const { a, view } = await adminView(url);
    const { a: other } = await adminView(url);
    expect(await call(a, 'game:delete', { id: view.game.id })).toEqual({ ok: false, error: 'GAME_ACTIVE' });
    const { id: gid } = await call(a, 'game:create', { title: 'Лишняя' });
    const opened = nextEvent(other, 'state:admin', (v: AdminView) => v.editing?.id === gid);
    expect(await call(other, 'game:open', { id: gid })).toEqual({ ok: true });
    await opened;
    const closed = nextEvent(other, 'state:admin', (v: AdminView) => v.games.length === 1);
    expect(await call(a, 'game:delete', { id: gid })).toEqual({ ok: true });
    expect((await closed).editing).toBeNull();
    expect(fs.existsSync(path.join(dir, 'games', gid))).toBe(false);
    expect(await call(a, 'game:delete', { id: gid })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await call(a, 'game:delete', { id: '..' })).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('game:open gives editing to that admin socket only', async () => {
    const url = await start();
    const { a, view } = await adminView(url);
    const { a: b } = await adminView(url);
    const mine = nextEvent(a, 'state:admin', (v: AdminView) => v.editing !== null);
    expect(await call(a, 'game:open', { id: view.game.id })).toEqual({ ok: true });
    expect((await mine).editing).toMatchObject({ id: view.game.id, active: true, settings: { title: 'Сумеречный шабаш' } });

    const ofA = nextEvent(a, 'state:admin', (v: AdminView) => v.games.length === 2);
    const ofB = nextEvent(b, 'state:admin', (v: AdminView) => v.games.length === 2);
    await call(a, 'game:create', { title: 'Ещё' });
    expect((await ofA).editing?.id).toBe(view.game.id);
    expect((await ofB).editing).toBeNull();

    const shut = nextEvent(a, 'state:admin', (v: AdminView) => v.editing === null);
    expect(await call(a, 'game:open', { id: null })).toEqual({ ok: true });
    await shut;
    expect(await call(a, 'game:open', { id: '../..' })).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('game:updateSettings of the active game reaches state:public; bad values → INVALID_SETTINGS', async () => {
    const url = await start();
    const c = await connect(url);
    const { a, view } = await adminView(url);
    const id = view.game.id;
    const settings = { title: 'Шабаш-2', subtitle: 'п', description: 'о', scoring: { wrongPenalty: true, startScore: 50 } };
    const pub = nextEvent(c, 'state:public', (v: PublicView) => v.game.title === 'Шабаш-2');
    expect(await call(a, 'game:updateSettings', { id, settings })).toEqual({ ok: true });
    expect((await pub).game.subtitle).toBe('п');
    expect(readGame(id)).toMatchObject({ ...settings, rounds: [{ name: 'Раунд 1' }] });
    for (const lobbyMusic of ['../../state.json', 'missing.mp3', '', null]) {
      expect(await call(a, 'game:updateSettings', { id, settings: { ...settings, lobbyMusic } }))
        .toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    }
    expect(await call(a, 'game:updateSettings', { id, settings: { ...settings, title: '' } }))
      .toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    expect(readGame(id).title).toBe('Шабаш-2');

    // startScore of the active game is given to players who join now.
    await player(url, 'Новичок');
    const { view: after } = await adminView(url);
    expect(after.players.find((p) => p.name === 'Новичок')?.score).toBe(50);
  });

  it('game:updateSettings: omitting a media key clears it', async () => {
    const url = await start();
    const c = await connect(url);
    const { a, view } = await adminView(url);
    const id = view.game.id;
    const { file } = await (await postMedia(url, id, JPEG)).json() as { file: string };
    const settings = { title: 'Т', subtitle: '', description: '', scoring: { wrongPenalty: false, startScore: 0 } };
    const withBg = nextEvent(c, 'state:public', (v: PublicView) => v.game.background !== undefined);
    expect(await call(a, 'game:updateSettings', { id, settings: { ...settings, background: file } })).toEqual({ ok: true });
    expect((await withBg).game.background).toBe(`/games/${id}/media/${file}`);
    expect(readGame(id).background).toBe(file);
    const noBg = nextEvent(c, 'state:public', (v: PublicView) => v.game.background === undefined);
    expect(await call(a, 'game:updateSettings', { id, settings })).toEqual({ ok: true });
    await noBg;
    expect('background' in readGame(id)).toBe(false);
  });

  it('disk write failure → SAVE_FAILED, game unchanged', async () => {
    const url = await start();
    const { a } = await adminView(url);
    const { id } = await call(a, 'game:create', { title: 'Хрупкая' });
    fs.rmSync(gameJson(id));
    fs.mkdirSync(gameJson(id));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const settings = { title: 'Другая', subtitle: '', description: '', scoring: { wrongPenalty: false, startScore: 0 } };
    expect(await call(a, 'game:updateSettings', { id, settings })).toEqual({ ok: false, error: 'SAVE_FAILED' });
    const item = { name: 'Метла', description: '', price: 1, quantity: 1, hidden: false };
    expect(await call(a, 'admin:itemAdd', { gameId: id, item })).toEqual({ ok: false, error: 'SAVE_FAILED' });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
    const opened = nextEvent(a, 'state:admin', (v: AdminView) => v.editing?.id === id);
    expect(await call(a, 'game:open', { id })).toEqual({ ok: true });
    const v = await opened;
    expect(v.editing!.settings.title).toBe('Хрупкая');
    expect(v.editing!.shop).toEqual([]);
  });

  describe('state.json write failure → SAVE_FAILED, nothing changes, server keeps answering', () => {
    const breakState = () => {
      fs.rmSync(statePath, { force: true });
      fs.mkdirSync(statePath);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      return () => {
        expect(warn).toHaveBeenCalled();
        fs.rmSync(statePath, { recursive: true });
        warn.mockRestore();
      };
    };

    it('game:activate and progress events', async () => {
      const url = await start();
      const { c, id } = await player(url, 'Игрок');
      const { a, view } = await adminView(url);
      const { id: gid } = await call(a, 'game:create', { title: 'Другая' });
      const repair = breakState();
      expect(await call(a, 'game:activate', { id: gid })).toEqual({ ok: false, error: 'SAVE_FAILED' });
      expect(await call(a, 'admin:adjustScore', { playerId: id, delta: 5 })).toEqual({ ok: false, error: 'SAVE_FAILED' });
      expect(await call(c, 'player:join', { name: 'Второй' })).toEqual({ ok: false, error: 'SAVE_FAILED' });
      repair();
      const fresh = await connect(url);
      expect(views.get(fresh)).toMatchObject({
        game: { id: view.game.id }, players: [{ id, name: 'Игрок', score: 0 }],
      });
      expect(await call(a, 'admin:audio', { action: 'play' })).toEqual({ ok: true });
    });

    it('admin:itemDelete in the active game keeps game.json and purchases together', async () => {
      const url = await start();
      const buyer = await player(url, 'Покупатель');
      const { a, view } = await adminView(url);
      const gid = view.game.id;
      await call(a, 'admin:startGame');
      await call(a, 'admin:adjustScore', { playerId: buyer.id, delta: 500 });
      const added = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 1);
      await call(a, 'admin:itemAdd', { gameId: gid, item: { name: 'Метла', description: '', price: 100, quantity: 2, hidden: false } });
      const itemId = (await added).shop.items[0].id;
      expect(await call(a, 'admin:sell', { itemId, playerId: buyer.id })).toEqual({ ok: true });
      const repair = breakState();
      expect(await call(a, 'admin:itemDelete', { gameId: gid, id: itemId })).toEqual({ ok: false, error: 'SAVE_FAILED' });
      repair();
      expect(readGame(gid).shop.map((i: { id: string }) => i.id)).toEqual([itemId]);
      const { view: after } = await adminView(url);
      expect(after.shop.items.map((i) => i.id)).toEqual([itemId]);
      expect(after.shop.purchases).toHaveLength(1);
    });
  });

  it('duplicate keeps item ids; deleting the item in the copy keeps active purchases', async () => {
    const url = await start();
    const buyer = await player(url, 'Покупатель');
    const { a, view } = await adminView(url);
    const active = view.game.id;
    await call(a, 'admin:startGame');
    await call(a, 'admin:adjustScore', { playerId: buyer.id, delta: 500 });
    const added = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 1);
    const item = { name: 'Метла', description: '', price: 100, quantity: 2, hidden: false };
    expect(await call(a, 'admin:itemAdd', { gameId: active, item })).toEqual({ ok: true });
    const itemId = (await added).shop.items[0].id;
    expect(await call(a, 'admin:sell', { itemId, playerId: buyer.id })).toEqual({ ok: true });

    const dup = await call(a, 'game:duplicate', { id: active });
    expect(dup).toEqual({ ok: true, id: expect.stringMatching(GAME_ID) });
    expect(readGame(dup.id).shop.map((i: { id: string }) => i.id)).toEqual([itemId]);
    // The copy is inactive, so its sold count is 0; the active game still counts its sale.
    expect(await call(a, 'admin:itemUpdate', { gameId: dup.id, id: itemId, item: { ...item, quantity: 1 } }))
      .toEqual({ ok: true });
    expect(await call(a, 'admin:itemUpdate', { gameId: active, id: itemId, item: { ...item, quantity: 1 } }))
      .toEqual({ ok: true });
    expect(await call(a, 'admin:itemUpdate', { gameId: active, id: itemId, item: { ...item, quantity: 0 } }))
      .toEqual({ ok: false, error: 'INVALID_ITEM' });
    expect(await call(a, 'admin:itemDelete', { gameId: dup.id, id: itemId })).toEqual({ ok: true });

    const opened = nextEvent(a, 'state:admin', (v: AdminView) => v.editing?.id === dup.id);
    expect(await call(a, 'game:open', { id: dup.id })).toEqual({ ok: true });
    const v = await opened;
    expect(v.editing!.shop).toEqual([]);
    expect(v.shop.items.map((i) => i.id)).toEqual([itemId]);
    expect(v.shop.purchases).toHaveLength(1);
    expect(v.games.map((g) => g.title)).toContain('Сумеречный шабаш (копия)');
  });

  it('deleting an item in the active game drops its purchases', async () => {
    const url = await start();
    const buyer = await player(url, 'Покупатель');
    const { a, view } = await adminView(url);
    await call(a, 'admin:startGame');
    await call(a, 'admin:adjustScore', { playerId: buyer.id, delta: 500 });
    const added = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 1);
    const item = { name: 'Метла', description: '', price: 100, quantity: 2, hidden: false };
    await call(a, 'admin:itemAdd', { gameId: view.game.id, item });
    const itemId = (await added).shop.items[0].id;
    await call(a, 'admin:sell', { itemId, playerId: buyer.id });
    const gone = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 0);
    expect(await call(a, 'admin:itemDelete', { gameId: view.game.id, id: itemId })).toEqual({ ok: true });
    expect((await gone).shop.purchases).toEqual([]);
  });

  it('item image must exist in the game media', async () => {
    const url = await start();
    const { a, view } = await adminView(url);
    const id = view.game.id;
    const item = { name: 'Метла', description: '', price: 1, quantity: 1, hidden: false, image: 'nope.jpg' };
    expect(await call(a, 'admin:itemAdd', { gameId: id, item })).toEqual({ ok: false, error: 'INVALID_ITEM' });
    const { file } = await (await postMedia(url, id, JPEG)).json() as { file: string };
    const added = nextEvent(a, 'state:admin', (v: AdminView) => v.shop.items.length === 1);
    expect(await call(a, 'admin:itemAdd', { gameId: id, item: { ...item, image: file } })).toEqual({ ok: true });
    expect((await added).shop.items[0].imageUrl).toBe(`/games/${id}/media/${file}`);
  });

  it('broken active game.json: server starts on another game, broken one listed with error', async () => {
    const url = await start();
    const { a, view } = await adminView(url);
    const broken = view.game.id;
    const { id: spare } = await call(a, 'game:create', { title: 'Запасная' });
    expect(await call(a, 'game:activate', { id: broken })).toEqual({ ok: true }); // writes state.json
    fs.writeFileSync(gameJson(broken), '{');

    await stop();
    const { a: a2, view: v2 } = await adminView(await start());
    expect(v2.game.id).toBe(spare);
    expect(v2.games.find((g) => g.id === broken)).toMatchObject({ active: false, error: expect.any(String) });
    expect(await call(a2, 'game:activate', { id: broken })).toEqual({ ok: false, error: 'GAME_BROKEN' });
    expect(await call(a2, 'game:duplicate', { id: broken })).toEqual({ ok: false, error: 'GAME_BROKEN' });
  });

  it('only game broken: a new empty game becomes active', async () => {
    const broken = gameIdOf(await connect(await start()));
    await stop();
    fs.writeFileSync(gameJson(broken), '{');
    const { view } = await adminView(await start());
    expect(view.game.id).not.toBe(broken);
    expect(view.game.title).toBe('Новая игра');
    expect(view.games).toHaveLength(2);
  });
});

describe('game media', () => {
  const big = (head: Buffer, size: number) => Buffer.concat([head, Buffer.alloc(size - head.length, 1)]);

  it('upload checks PIN, then game, then type, then size', async () => {
    const url = await start();
    const id = gameIdOf(await connect(url));
    expect((await postMedia(url, 'g-zzzzzzzz', JPEG, 'bad')).status).toBe(401);
    expect((await postMedia(url, id, JPEG, 'bad')).status).toBe(401);
    expect((await postMedia(url, 'g-zzzzzzzz', JPEG)).status).toBe(404);
    expect((await postMedia(url, '..', JPEG)).status).toBe(404);
    const bad = await postMedia(url, id, Buffer.from('hello'));
    expect(bad.status).toBe(415);
    expect(await bad.json()).toEqual({ error: 'UNSUPPORTED_TYPE' });
    expect((await postMedia(url, id, Buffer.alloc(0))).status).toBe(415);
    const tooBig = await postMedia(url, id, big(JPEG, 5 * 1024 * 1024 + 1));
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: 'TOO_LARGE' });
    const mp3 = await postMedia(url, id, big(Buffer.from('ID3'), 6 * 1024 * 1024));
    expect(mp3.status).toBe(200);
    expect((await mp3.json()).file).toMatch(/^[0-9a-f-]{36}\.mp3$/);
    expect((await postMedia(url, id, big(Buffer.from('ID3'), 20 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it('upload saves the file and serves it with safe headers', async () => {
    const url = await start();
    const id = gameIdOf(await connect(url));
    const res = await postMedia(url, id, JPEG);
    expect(res.status).toBe(200);
    const body = await res.json() as { file: string; url: string };
    expect(body.file).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(body.url).toBe(`/games/${id}/media/${body.file}`);
    const got = await fetch(url + body.url);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-security-policy'))
      .toBe("default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; sandbox");
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await got.arrayBuffer())).toEqual(JPEG);
  });

  it('serving never leaks game.json', async () => {
    const url = await start();
    const id = gameIdOf(await connect(url));
    for (const p of [
      `/games/${id}/game.json`,
      `/games/${id}/media/..%2Fgame.json`,
      `/games/${id}/media/%2e%2e%2fgame.json`,
      `/games/${id}/media/..%5Cgame.json`,
      `/games/${id}/media/missing.jpg`,
      `/games/..%2F${id}/media/game.json`,
      '/games/g-zzzzzzzz/media/x.jpg',
    ]) {
      const res = await fetch(url + p);
      expect(res.status, p).toBe(404);
      expect(await res.text(), p).not.toContain('СЕКРЕТНЫЙ-ОТВЕТ');
    }
    expect((await fetch(`${url}/api/shop/image`, { method: 'POST', body: new Uint8Array(JPEG) })).status).toBe(404);
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
