# Библиотека игр — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Несколько игр-шаблонов (настройки, вопросы, каталог магазина, медиа) в папках `server/data/games/<id>/`, управление ими из админки, автоматическая миграция текущей игры.

**Architecture:** Шаблоны игр живут в `GameLibrary` (папка на игру, запись на диск сразу). `GameState` хранит только прогресс вечера и `activeGameId`; логика и представления получают активную игру `{ id, def }` вместо `QuestionPack`. Каталог магазина переезжает из `GameState` в `GameDef.shop`. Медиа игры раздаются отдельным маршрутом, который отдаёт только файлы из `media/`.

**Tech Stack:** TypeScript, Node + Express + socket.io, React + Vite, Vitest. Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-19-games-library-design.md`

## Global Constraints

- Id игры: `g-` + 8 символов `[a-z0-9]`, проверка `^g-[a-z0-9]{8}$` для всего, что приходит от клиента; совпадает с именем папки.
- `title` 1–60 символов (после trim), `subtitle` 0–120, `description` 0–500; `scoring.startScore` — целое 0–100000; `scoring.wrongPenalty` — boolean.
- Медиа — имена файлов прямо в `games/<id>/media/` (без подпапок), URL: `/games/<id>/media/<файл>`.
- Загрузка: картинки jpg/png/webp/svg до 5 МБ, аудио mp3/ogg/wav/m4a до 20 МБ; тип по сигнатуре; ответы 401/404/413/415, успех — `{ file, url }`.
- Запись `game.json` и `state.json` атомарная (tmp + rename).
- Громкость музыки лобби 0.4, затухание 1.5 с.
- Все тексты интерфейса — на русском; копирайт кнопок/тостов — как в спецификации и в этом плане.
- `server/data/games/` добавить в `.gitignore` (пользовательские данные, как `media/shop/`).

## Review Focus

1. **Утечка ответов через раздачу медиа** — `GET /games/<id>/game.json`, `/games/<id>/media/../game.json`, `%2e%2e%2f` должны давать 404, а не JSON с ответами. Тест — в Task 7.
2. **Совпадающие id предметов у дубликата** — `duplicateGame` копирует id предметов; удаление предмета в *неактивной* копии не должно стирать покупки активной игры. Тест — в Task 7.
3. **Миграция на реальных данных** — существующий `state.json` с игроками, очками и покупками переживает миграцию; второй старт не мигрирует повторно. Тест — в Task 6 и Task 7.
4. **Подмена путей в настройках** — `lobbyMusic: "../../state.json"` или несуществующий файл в `game:updateSettings` → `INVALID_SETTINGS`. Тест — в Task 1.
5. **Активация посреди вопроса / открытой лавки** — сброс снимает `activeQuestion`, закрывает лавку, фаза `lobby`. Тест — в Task 4.

---

### Task 1: Типы и валидация `game.json`

**Files:**
- Modify: `shared/src/types.ts`, `server/src/questions.ts`, `server/src/game/shop.ts` (только `parseItem`)
- Create: `server/src/games/validate.ts`
- Test: `server/test/validate.test.ts`, `server/test/shop.test.ts` (обновить кейс с `image`)

**Interfaces:**
- Produces (в `shared/src/types.ts`):
  ```ts
  export interface Scoring { wrongPenalty: boolean; startScore: number }
  export interface GameSettings { title: string; subtitle: string; description: string; lobbyMusic?: string; background?: string; scoring: Scoring }
  export interface GameDef extends GameSettings, QuestionPack { version: 1; shop: ShopItem[] }
  export interface ActiveGame { id: string; def: GameDef }
  export interface GameSummary { id: string; title: string; description: string; rounds: number; questions: number; active: boolean; error?: string }
  export interface GameEditView { id: string; active: boolean; settings: GameSettings; media: { lobbyMusic?: string; background?: string }; shop: AdminShopItem[]; rounds: { name: string; themes: number; questions: number }[] }
  ```
  `ShopItem.image` теперь имя файла. `AdminShopItem` получает `imageUrl?: string`. `ShopState` = `{ open: boolean; purchases: Purchase[] }`. `GameState` получает `activeGameId: string`. `PublicView` получает `game: { id: string; title: string; subtitle: string; background?: string; lobbyMusic?: string }` (URL). `AdminView` получает `games: GameSummary[]; editing: GameEditView | null`. `ErrorCode` += `'NO_QUESTIONS' | 'GAME_BROKEN' | 'GAME_ACTIVE' | 'INVALID_SETTINGS' | 'SAVE_FAILED'`.
- Produces (`server/src/questions.ts`): экспортировать `round(v, p, mediaDir): Round` и `media(o, key, p, mediaDir)` (ключ расширить до `string`). `QuestionsError` без изменений.
- Produces (`server/src/games/validate.ts`):
  - `GAME_ID_RE = /^g-[a-z0-9]{8}$/`
  - `parseGame(raw: unknown, mediaDir: string): GameDef` — бросает `QuestionsError` с путём поля (`title`, `scoring.startScore`, `rounds[0].themes[1]…`, `shop[2].image`).
  - `parseSettings(raw: unknown, mediaDir: string): GameSettings | null`.
- Produces (`shop.ts`): `parseItem` принимает `image` как имя файла по `^[a-z0-9-]+\.(jpg|png|webp|svg)$`.

- [ ] **Step 1: Write the failing tests** (`server/test/validate.test.ts`, временная папка `media/` с `a.mp3`, `b.jpg`)
  - `parseGame` на полном корректном объекте возвращает его же (с trim у строк).
  - `rounds: []` допустимо; `rounds` отсутствует → бросает с `rounds`.
  - `title: ''` → `title`; `title` из 61 символа → `title`; `subtitle` 121 → `subtitle`.
  - `scoring.startScore: -1` и `1.5` → `scoring.startScore`; `wrongPenalty: 'yes'` → `scoring.wrongPenalty`.
  - `lobbyMusic: 'нет.mp3'` → сообщение содержит `lobbyMusic` и `файл не найден`.
  - `shop: [{ ...item, image: 'zz.jpg' }]` при отсутствующем файле → `shop[0].image`; дубликат id предметов → `shop[1].id`.
  - `version: 2` → `version`.
  - `parseSettings({ ...valid, lobbyMusic: '../../state.json' }, dir)` → `null`; с `lobbyMusic: 'a.mp3'` → объект.
  - В `shop.test.ts`: `parseItem({ ...item, image: 'ab-12.jpg' })?.image === 'ab-12.jpg'`; `image: '/media/shop/ab-12.jpg'` → `null`.

- [ ] **Step 2: Run** `npx vitest run server/test/validate.test.ts server/test/shop.test.ts` — Expected: FAIL (модуль не найден / старый формат image).

- [ ] **Step 3: Implement** типы, экспорт из `questions.ts`, новый `IMAGE_RE` в `parseItem`, `validate.ts`. `parseGame` для `shop[i]` вызывает `parseItem`, проверяет `id` (непустая строка, уникальна) и наличие файла `image` через `media()`.

- [ ] **Step 4: Run** те же тесты — Expected: PASS.

- [ ] **Step 5: Commit** `feat: game definition types and validation`

---

### Task 2: Определение типа загружаемого медиа

**Files:**
- Create: `server/src/games/upload.ts`
- Test: `server/test/upload.test.ts`

**Interfaces:**
- Consumes: `imageExt(buf)` из `server/src/game/avatar.ts`.
- Produces:
  ```ts
  export type MediaKind = 'image' | 'audio';
  export type MediaExt = 'jpg' | 'png' | 'webp' | 'svg' | 'mp3' | 'ogg' | 'wav' | 'm4a';
  export const MAX_MEDIA_BYTES: Record<MediaKind, number>; // image 5*1024*1024, audio 20*1024*1024
  export function detectMedia(buf: Uint8Array): { kind: MediaKind; ext: MediaExt } | null;
  ```
  Сигнатуры: mp3 — `ID3` или кадр `0xFF` + `(b1 & 0xE0) === 0xE0`; ogg — `OggS`; wav — `RIFF`…`WAVE` (байты 8–11); m4a — `ftyp` в байтах 4–7; svg — текст (после BOM и пробелов) начинается с `<svg` или `<?xml` и содержит `<svg` в первых 1024 байтах.

- [ ] **Step 1: Write the failing tests** — по одному буферу на каждый формат → ожидаемые `{kind, ext}`; `RIFF....WEBP` → `webp/image`, `RIFF....WAVE` → `wav/audio`; `<?xml …><html>` → `null`; `Buffer.from('hello')` → `null`; пустой буфер → `null`.
- [ ] **Step 2: Run** `npx vitest run server/test/upload.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `detectMedia` и `MAX_MEDIA_BYTES`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: detect uploaded media type by signature`

---

### Task 3: `GameLibrary` — хранилище игр на диске

**Files:**
- Create: `server/src/games/store.ts`
- Test: `server/test/store.test.ts`

**Interfaces:**
- Consumes: `parseGame`, `GAME_ID_RE` (Task 1).
- Produces:
  ```ts
  export type GameEntry = { id: string; def: GameDef } | { id: string; error: string };
  export function newGameId(): string;                       // 'g-' + 8 из [a-z0-9] (crypto.randomBytes)
  export function emptyGame(title: string): GameDef;         // subtitle '', description '', scoring {false, 0}, rounds [], shop []
  export function referencedMedia(def: GameDef): Set<string>;
  export class GameLibrary {
    constructor(gamesDir: string);                           // создаёт gamesDir, загружает все папки по GAME_ID_RE
    entries(): GameEntry[];                                  // сортировка по title (ru), битые — по id в конце
    get(id: string): GameEntry | undefined;
    def(id: string): GameDef | null;                         // null для битой/отсутствующей
    mediaDir(id: string): string;
    create(title: string): ActiveGame;
    duplicate(id: string): ActiveGame | null;                // копия папки, title + ' (копия)', обрезать до 60 символов
    save(id: string, def: GameDef): void;                    // атомарно; бросает при ошибке записи, память не меняет
    remove(id: string): void;
    sweepMedia(id: string): string[];                        // удалённые имена файлов
  }
  ```

- [ ] **Step 1: Write the failing tests** (временная `gamesDir`)
  - `newGameId()` соответствует `GAME_ID_RE`.
  - `create('Игра')` → папка `<id>/game.json` и `<id>/media/` существуют; новый `GameLibrary(dir).def(id)` равен `emptyGame('Игра')`.
  - Битый `g-aaaaaaaa/game.json` (`{`) → `get` возвращает `{ id, error }` с текстом; `def` → `null`; папка `junk/` игнорируется.
  - `duplicate(id)` копирует `media/x.jpg`, новый id ≠ старый, title `'Игра (копия)'`; title из 60 символов после копирования ≤ 60.
  - `save` при подменённом `fs.renameSync` (vi.spyOn → throw) бросает, `def(id)` остаётся прежним, `game.json.tmp` не остаётся.
  - `remove(id)` удаляет папку и запись.
  - `sweepMedia` удаляет `orphan.mp3`, оставляет файлы из `lobbyMusic`, `background`, `question.image/audio`, `shop[].image`; возвращает `['orphan.mp3']`.
- [ ] **Step 2: Run** `npx vitest run server/test/store.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `store.ts`. `duplicate` через `fs.cpSync(src, dst, { recursive: true })`, затем `save` с новым title.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: game library storage`

---

### Task 4: Логика: каталог в игре, правила очков, активация

**Files:**
- Modify: `server/src/game/logic.ts`, `server/src/game/shop.ts`
- Test: `server/test/logic.test.ts`, `server/test/shop.test.ts`, `server/test/smoke.test.ts`

**Interfaces:**
- Consumes: `GameDef`, `ShopItem`, `ShopState` (Task 1).
- Produces (`logic.ts`):
  ```ts
  initialState(activeGameId: string): GameState;   // shop { open: false, purchases: [] }
  registerPlayer(s, name, id, startScore = 0);     // score = startScore
  startGame(s, pack: QuestionPack): Result;        // NO_QUESTIONS, если ни одного вопроса
  judgeWrong(s, game: GameDef): Result;            // при wrongPenalty — минус номинал (может уйти в минус)
  newGame(s, opts: { removePlayers: boolean; startScore: number }): GameState;
  activateGame(s, id: string, startScore: number): GameState; // newGame с сохранением игроков + activeGameId = id
  ```
  Остальные функции — прежние сигнатуры.
- Produces (`shop.ts`):
  ```ts
  export type CatalogResult = { ok: true; items: ShopItem[] } | { ok: false; error: ErrorCode };
  addItem(items: ShopItem[], input: unknown, id: string): CatalogResult;
  updateItem(items: ShopItem[], id: string, input: unknown, sold: number): CatalogResult; // INVALID_ITEM при quantity < sold
  deleteItem(items: ShopItem[], id: string): CatalogResult;
  soldCount(s: GameState, itemId: string): number;
  remaining(s: GameState, items: ShopItem[], itemId: string): number;
  dropPurchasesOf(s: GameState, itemId: string): GameState;
  sellItem(s, items: ShopItem[], itemId, playerId, purchaseId, now): Result;
  ```
  `setShopOpen`, `cancelPurchase` — без изменений.

- [ ] **Step 1: Update/write the failing tests**
  - `initialState('g-aaaaaaaa')` → `{ phase: 'lobby', …, activeGameId: 'g-aaaaaaaa', shop: { open: false, purchases: [] } }` (обновить существующий кейс и `smoke.test.ts`).
  - `registerPlayer(s, 'Аня', 'p1', 300).player.score === 300`.
  - `startGame(s, { rounds: [] })` → `NO_QUESTIONS`; с вопросом → ok.
  - `judgeWrong` при `wrongPenalty: true` и вопросе на 200: очки отвечающего −200, он в `wrongPlayerIds`; при `false` очки не меняются.
  - `newGame(s, { removePlayers: false, startScore: 50 })` → у всех 50, покупки пусты.
  - `activateGame` из состояния с активным вопросом, открытой лавкой и фазой `game` → `activeQuestion: null`, `shop.open: false`, `phase: 'lobby'`, `playedCells: []`, игроки на месте с `startScore`, `activeGameId` новый. (Review Focus 5)
  - Каталог: `addItem([], item, 'i1')` → `[{ ...item, id: 'i1' }]`; `updateItem(items, 'i1', {...item, quantity: 1}, 2)` → `INVALID_ITEM`; `deleteItem(items, 'x')` → `NOT_FOUND`.
  - `sellItem(s, items, …)` — прежние кейсы (`SOLD_OUT`, `NOT_ENOUGH_POINTS`, списание) с каталогом в аргументе; `dropPurchasesOf` удаляет только покупки этого id.
- [ ] **Step 2: Run** `npx vitest run server/test/logic.test.ts server/test/shop.test.ts server/test/smoke.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** изменения в `logic.ts` и `shop.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: per-game catalog, scoring rules and game activation`

---

### Task 5: Сохранение прогресса и представления

**Files:**
- Modify: `server/src/persistence.ts`, `server/src/views.ts`
- Test: `server/test/persistence.test.ts`, `server/test/views.test.ts`

**Interfaces:**
- Consumes: Task 1 типы, Task 4 `remaining`, `GameEntry` (Task 3).
- Produces (`persistence.ts`):
  ```ts
  loadState(path: string, game: GameDef): GameState | null; // activeGameId — строка из файла ('' если нет); покупки — только на id из game.shop и существующих игроков
  readActiveGameId(path: string): string | null;            // без карантина, null при любой проблеме
  loadShop(raw: unknown, playerIds: Set<string>, itemIds: Set<string>): ShopState;
  ```
  `saveState` без изменений.
- Produces (`views.ts`):
  ```ts
  mediaUrl(gameId: string, file: string): string;  // `/games/${gameId}/media/${encodeURIComponent(file)}`
  clientItem(gameId: string, item: ShopItem): ShopItem; // image → URL
  toPublicView(s: GameState, game: ActiveGame, joinUrl: string): PublicView;
  toAdminView(s: GameState, game: ActiveGame, joinUrl: string, games: GameSummary[], editing: GameEditView | null): AdminView;
  summarize(entry: GameEntry, activeId: string): GameSummary;
  editView(s: GameState, game: ActiveGame, activeId: string): GameEditView; // remaining = quantity для неактивной; imageUrl
  trophiesOf(s: GameState, game: ActiveGame, playerId: string): Trophy[];  // item через clientItem
  ```
  `PublicQuestionView.image/audio` и `PublicShopItem.image` — URL через `mediaUrl`.

- [ ] **Step 1: Update/write the failing tests**
  - `persistence`: сохранённое состояние с `activeGameId: 'g-aaaaaaaa'` читается обратно; покупка с `itemId`, которого нет в `game.shop`, отбрасывается; старый формат с `shop.items` читается (items игнорируются); `readActiveGameId` → `'g-aaaaaaaa'`, для битого JSON → `null` и файл не переименован.
  - `views`: `toPublicView(...).game` = `{ id, title, subtitle, background: '/games/g-aaaaaaaa/media/bg.jpg' }`; вопрос с `image: 'izba.svg'` → `'/games/g-aaaaaaaa/media/izba.svg'`; закрытый предмет — по-прежнему без `name/description/image`; `trophiesOf` отдаёт URL картинки.
  - `summarize` для битой записи → `{ id, title: id, description: '', rounds: 0, questions: 0, active: false, error }`; для исправной считает вопросы по всем раундам.
  - `editView` для неактивной игры: `remaining === quantity`, `imageUrl` заполнен; `media.lobbyMusic` — URL.
- [ ] **Step 2: Run** `npx vitest run server/test/persistence.test.ts server/test/views.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: progress persistence and views for the active game`

---

### Task 6: Миграция старой игры

**Files:**
- Create: `server/src/games/migrate.ts`
- Test: `server/test/migrate.test.ts`

**Interfaces:**
- Consumes: `GameLibrary`, `emptyGame` (Task 3), `loadQuestions` (`questions.ts`), `parseItem` (Task 1), `saveState` (Task 5).
- Produces:
  ```ts
  /** Запускать, только если папки games/ ещё нет. Возвращает id созданной игры. */
  export function migrate(opts: { dataDir: string; statePath: string; lib: GameLibrary }): string;
  ```
  Поведение:
  1. `loadQuestions(dataDir/questions.json, dataDir/media)`. Успех → игра `title: 'Сумеречный шабаш'`, `subtitle: 'Наведи телефон на знак — и входи в лес'`, `rounds` из файла, медиа вопросов копируются из `media/` в папку игры. Ошибка/нет файла → `console.warn`, `emptyGame('Новая игра')`.
  2. Если `state.json` читается и содержит `shop.items` — каждый предмет: `image: '/media/shop/x.jpg'` → копировать `media/shop/x.jpg`, `image: 'x.jpg'` (нет файла → без картинки); затем `parseItem`, невалидные пропустить.
  3. Если `state.json` есть — переписать: `activeGameId`, `shop: { open, purchases }`, остальное как было. Если нет — не создавать.
  4. Исходные файлы не удаляются.

- [ ] **Step 1: Write the failing tests** (временная `dataDir` с `questions.json`, `media/izba.svg`, `media/shop/abc.jpg`, `state.json` с 2 игроками, предметом с картинкой и покупкой)
  - Игра создана, `def.rounds` совпадает с вопросами, `media/izba.svg` скопирован в папку игры.
  - `def.shop[0].image === 'abc.jpg'`, файл скопирован; предмет с отсутствующей картинкой мигрирует без `image`.
  - `state.json` после: `activeGameId === id`, игроки и очки те же, покупка на месте, `shop.items` нет.
  - Исходные `questions.json` и `media/shop/abc.jpg` на месте.
  - Битый `questions.json` → игра `'Новая игра'` с `rounds: []`.
  - Нет `state.json` → файл не создаётся.
- [ ] **Step 2: Run** `npx vitest run server/test/migrate.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `migrate.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: migrate legacy questions and shop into the first game`

---

### Task 7: Сервер — запуск, события игр, загрузка и раздача медиа

**Files:**
- Modify: `server/src/server.ts`, `server/src/index.ts`, `shared/src/events.ts`, `client/vite.config.ts`, `.gitignore`
- Test: `server/test/server.test.ts`

**Interfaces:**
- Consumes: всё из Tasks 1–6.
- Produces:
  - `QuizServerOptions = { dataDir: string; statePath: string; pin: string; joinUrl: string; clientDist?: string }` (`index.ts` передаёт `here('../data')`). Аватарки — `dataDir/media/avatars`, игры — `dataDir/games`.
  - Запуск: нет `games/` → `migrate`; затем `GameLibrary`; активная = запись с id из `readActiveGameId`, если исправна, иначе первая исправная из `entries()`, иначе `lib.create('Новая игра')`; `state = loadState(...) ?? initialState(id)`; если `state.activeGameId !== id` → `activateGame(state, id, startScore)` и сохранить; `sweepMedia` для всех исправных.
  - События в `events.ts` (все админские, `UNAUTHORIZED` без авторизации):
    ```ts
    'game:create': (p: { title: string }, ack: IdAck) => void;      // INVALID_SETTINGS при пустом/длинном title
    'game:duplicate': (p: { id: string }, ack: IdAck) => void;      // GAME_BROKEN для битой
    'game:delete': (p: { id: string }, ack: Ack) => void;           // GAME_ACTIVE для активной
    'game:activate': (p: { id: string }, ack: Ack) => void;         // GAME_BROKEN для битой
    'game:open': (p: { id: string | null }, ack: Ack) => void;      // socket.data.editingId
    'game:updateSettings': (p: { id: string; settings: GameSettings }, ack: Ack) => void;
    'admin:itemAdd': (p: { gameId: string; item: ShopItemInput }, ack: Ack) => void;
    'admin:itemUpdate': (p: { gameId: string; id: string; item: ShopItemInput }, ack: Ack) => void;
    'admin:itemDelete': (p: { gameId: string; id: string }, ack: Ack) => void;
    ```
    `type IdAck = (r: { ok: true; id: string } | { ok: false; error: ErrorCode }) => void`. Ошибка записи на диск → `SAVE_FAILED`.
  - `itemUpdate` для активной игры передаёт `soldCount`, для неактивной — 0. `itemDelete` вызывает `dropPurchasesOf` только для активной игры. `admin:sell` использует `def.shop` активной игры, `shop:purchased.item` — через `clientItem`.
  - `state:admin` рассылается каждому админ-сокету отдельно с его `editing` (из `socket.data.editingId`; удалённая игра → `editing: null` и `editingId` сбрасывается). `state:public` — при любом изменении активной игры или прогресса.
  - HTTP: `POST /api/games/:id/media` (`express.raw({ type: () => true, limit: '20mb' })`, проверки в порядке PIN → игра исправна → `detectMedia` → `MAX_MEDIA_BYTES[kind]`), `GET /games/:id/media/:file` (id по `GAME_ID_RE`, `file === path.basename(file)`, не начинается с `.`, иначе 404; `res.sendFile`). `/api/shop/image` удалить.
  - `vite.config.ts`: прокси `'/games': 'http://localhost:3000'`. `.gitignore`: `server/data/games/`.

- [ ] **Step 1: Update/write the failing tests** (`start()` создаёт сервер с `dataDir: dir`; `questions.json` и `media/` в `dir` — их подхватывает миграция; существующие тесты магазина передают `gameId` из `view.game.id`)
  - Старт мигрирует: `state:public.game.title === 'Сумеречный шабаш'`, сетка как раньше; второй старт на той же папке не создаёт новую игру (`games.length === 1`).
  - Миграция сохраняет игроков и покупки из заранее записанного `state.json` (Review Focus 3).
  - `game:create {title:'Новая'}` → `{ ok, id }`, игра в `AdminView.games`; `title: ''` → `INVALID_SETTINGS`; без авторизации → `UNAUTHORIZED`.
  - `game:activate` пустой игры → `state:public.game.title === 'Новая'`, фаза `lobby`, игроки на месте; затем `admin:startGame` → `NO_QUESTIONS`.
  - `game:delete` активной → `GAME_ACTIVE`; неактивной → пропадает из списка, папка удалена; у админа, который её открыл, `editing: null`.
  - `game:open` на одном админ-сокете даёт ему `editing`, второй админ-сокет получает `editing: null`.
  - `game:updateSettings` активной игры с новым `title` → `state:public.game.title` обновился; с `lobbyMusic: '../../state.json'` → `INVALID_SETTINGS`.
  - Дубликат активной игры, удаление в дубликате предмета с тем же id → покупка в активной игре остаётся (Review Focus 2).
  - `game.json` в папке активной игры заменить на `{` и перезапустить → сервер стартует, активной стала другая исправная или новая игра, битая в списке с `error`.
  - Загрузка: без PIN → 401; неизвестный id → 404; `hello` → 415; jpeg → 200 `{ file, url }`, `GET url` → 200 с теми же байтами; картинка > 5 МБ → 413; mp3 (ID3) 6 МБ → 200.
  - Раздача: `GET /games/<id>/game.json`, `/games/<id>/media/..%2Fgame.json`, `/games/<id>/media/%2e%2e%2fgame.json` → 404 и тело не содержит текста ответа (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run server/test/server.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** изменения в `server.ts` (обработчики `game:*` вынести в функцию `registerGameHandlers(socket, ctx)` в том же файле или в `server/src/games/handlers.ts`, если `server.ts` перерастает ~400 строк), `index.ts`, `events.ts`, `vite.config.ts`, `.gitignore`.
- [ ] **Step 4: Run** `npm test` — Expected: все тесты PASS.
- [ ] **Step 5: Commit** `feat: game library on the server — events, upload and media routes`

---

### Task 8: Админка — вкладки, список игр, редактор игры

**Files:**
- Modify: `client/src/admin/AdminPage.tsx`, `client/src/admin/adminApi.ts`, `client/src/admin/ShopPanel.tsx`, `client/src/admin/ItemForm.tsx`, `client/src/admin/admin.css`, `client/src/admin/image.ts` (без изменений сигнатур)
- Create: `client/src/admin/GamesList.tsx`, `client/src/admin/GameEditor.tsx`, `client/src/admin/SettingsForm.tsx`, `client/src/admin/CatalogPanel.tsx`, `client/src/admin/MediaField.tsx`
- Test: `client/test/adminApi.test.ts`

**Interfaces:**
- Consumes: `AdminView.games`, `AdminView.editing`, события из Task 7.
- Produces (`adminApi.ts`):
  ```ts
  call(event: string, payload?: object, onOk?: (res: { ok: true; id?: string }) => void, onDone?: () => void): void;
  uploadMedia(gameId: string, blob: Blob): Promise<{ file: string; url: string }>; // заменяет uploadImage
  uploadErrorMessage(status: number | undefined): string; // 413 'Файл слишком большой', 415 'Этот формат не подходит', 401 'Нет доступа', иначе 'Не удалось загрузить файл'
  ```
  Новые сообщения: `NO_QUESTIONS: 'В игре нет вопросов'`, `GAME_BROKEN: 'Игра повреждена — исправьте game.json'`, `GAME_ACTIVE: 'Нельзя удалить активную игру'`, `INVALID_SETTINGS: 'Проверьте поля настроек'`, `SAVE_FAILED: 'Не удалось сохранить'`.
- Компоненты:
  - `AdminPage`: вкладки «Ведущий» / «Игры» (состояние в компоненте). «Ведущий» — как сейчас + `ShopPanel` без формы/изменения/удаления (открыть/закрыть, «Продать», журнал). «Игры» — `GameEditor`, если `view.editing`, иначе `GamesList`.
  - `GamesList({ view })`: карточки по `GameSummary` (название, описание, «N раундов · M вопросов», метка «Активна», ошибка красным); кнопки «Открыть», «Дублировать», «Удалить» (`confirm('Удалить игру «…»? Файлы игры будут удалены.')`, скрыта для активной), «Сделать активной» (`confirm('Очки и покупки сбросятся, игроки останутся. Продолжить?')`, скрыта для активной и битой); «+ Новая игра» (`prompt('Название игры')`, после ok — `game:open` с новым id).
  - `GameEditor({ edit })`: «← К списку игр» (`game:open {id:null}`), заголовок, `SettingsForm`, `CatalogPanel`, раздел «Вопросы» — список раундов «имя — T тем, Q вопросов» и подсказка `Редактор вопросов появится позже; пока вопросы правятся в server/data/games/<id>/game.json`.
  - `MediaField({ label, accept: 'image' | 'audio', url?: string, gameId, onChange(file: string | undefined) })`: выбор файла → для картинок кроме svg `downscaleImage(file, 1920)`, для аудио и svg — как есть → `uploadMedia`; превью `<img>` или `<audio controls>`; «Убрать».
  - `SettingsForm({ edit })`: поля по спецификации, `MediaField` для фона и музыки, чекбокс «Снимать очки за неверный ответ», «Стартовые очки», «Сохранить» → `game:updateSettings`.
  - `CatalogPanel({ edit })`: `ItemForm` + список предметов с «Изменить»/«Удалить»; `ItemForm` получает `gameId`, хранит `image` как имя файла, превью по `imageUrl`/url из загрузки.

- [ ] **Step 1: Write the failing tests** (`client/test/adminApi.test.ts`): `uploadErrorMessage(413/415/401/500/undefined)` → строки выше; `errorMessage('GAME_ACTIVE') === 'Нельзя удалить активную игру'`; `uploadMedia` с замоканным `fetch` шлёт `POST /api/games/g-aaaaaaaa/media` с заголовком `X-Admin-Pin` и возвращает `{ file, url }`; при 413 бросает ошибку со `status: 413`.
- [ ] **Step 2: Run** `npx vitest run client/test/adminApi.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `adminApi.ts`, затем компоненты и стили (существующие классы `card`, `btn`, `admin-row`, `muted`, `danger`; вкладки — класс `admin-tabs` с активной вкладкой золотой рамкой).
- [ ] **Step 4: Run** `npm test` и `npx tsc -p client --noEmit` — Expected: PASS, без ошибок типов.
- [ ] **Step 5: Commit** `feat: admin games tab with settings and per-game shop editor`

---

### Task 9: ТВ — тексты, фон, музыка лобби; документация

**Files:**
- Modify: `client/src/screen/ScreenPage.tsx`, `client/src/screen/Lobby.tsx`, `client/src/screen/QuestionView.tsx`, `client/src/screen/screen.css`, `client/test/buttonState.test.ts` (фикстура `PublicView`), `README.md`
- Create: `client/src/screen/lobbyMusic.ts`, `client/src/screen/SoundUnlock.tsx`

**Interfaces:**
- Consumes: `PublicView.game` (Task 5).
- Produces:
  - `useLobbyMusic(url: string | undefined, playing: boolean): { blocked: boolean; unlock: () => void }` — один `HTMLAudioElement` на хук, `loop`, громкость 0.4; при `playing → false` затухание до 0 за 1500 мс и пауза; смена `url` — перезапуск; `play()` отклонён → `blocked: true`; `unlock()` повторяет `play()`.
  - `SoundUnlock({ onClick })` — плашка в углу `🔊 Нажмите, чтобы включить звук`.
  - `ScreenPage`: фон из `view.game.background` — фиксированный слой `screen-bg` с тем же градиентом, что в `theme.css`, поверх гобелена; `useLobbyMusic(view?.game.lobbyMusic, view?.phase === 'lobby')`.
  - `Lobby`: `<h1>{view.game.title}</h1>`, подзаголовок — только если непустой.
  - `QuestionView`: `src={question.image}` / `src={question.audio}` (URL уже готовые).
  - `README.md`: раздел «Вопросы: questions.json» заменить на «Игры»: где лежат папки, формат `game.json` (поля из спецификации), что вопросы до редактора правятся в нём руками, миграция и резервная копия `questions.json`, перенос игры копированием папки.

- [ ] **Step 1: Update** фикстуру в `buttonState.test.ts` (`shop: { open: false, items: [] }`, добавить `game: { id: 'g-aaaaaaaa', title: 'T', subtitle: '' }`), реализовать хук, плашку, правки экранов и README.
- [ ] **Step 2: Run** `npm test` и `npx tsc -p client --noEmit` — Expected: PASS, без ошибок типов.
- [ ] **Step 3: Commit** `feat: lobby text, background and music from the active game`

---

### Task 10: Проверка в браузере

- [ ] **Step 1:** Сделать резервную копию `server/data/state.json` (если есть) и убедиться, что `server/data/games/` нет — так проверяется реальная миграция данных репозитория; `preview_start {name: 'quiz'}`; открыть `/admin` (PIN `1234`) и `/screen`.
- [ ] **Step 2:** Убедиться: вкладка «Игры» показывает «Сумеречный шабаш · 2 раунда» (или сколько в `questions.json`) с меткой «Активна»; на ТВ лобби с прежним названием и гобеленом.
- [ ] **Step 3:** Создать «Тестовая игра», загрузить фон (jpg) и музыку (`server/data/media/dark-forest.mp3`), задать подзаголовок, стартовые очки 100, сохранить; добавить предмет с фото; сделать активной.
- [ ] **Step 4:** На ТВ — новый заголовок, подзаголовок, фон, играет музыка; новый игрок с телефона получает 100 очков; «Начать игру» показывает тост «В игре нет вопросов».
- [ ] **Step 5:** Перезапустить сервер — игра, фон, музыка и предмет на месте. Вернуть «Сумеречный шабаш» активной, удалить тестовую игру.
- [ ] **Step 6:** `read_console_messages` без ошибок; скриншоты админки и ТВ — пользователю.
