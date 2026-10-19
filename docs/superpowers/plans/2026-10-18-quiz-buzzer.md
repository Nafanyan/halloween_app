# Квиз «Сумеречный шабаш» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Локальное веб-приложение «Своя игра»: телефоны-кнопки игроков, большой экран с сеткой и вопросами, админ-панель; всё в реальном времени по Wi-Fi.

**Architecture:** Сервер (Express + Socket.IO) держит единственное состояние игры. Игровая логика — чистые функции `(state, ...) → Result` без сети. Сетевой слой валидирует события, вызывает логику, сохраняет `state.json` и рассылает проекции состояния: публичную (экран, игроки) и админскую (с ответом). React-клиент с тремя маршрутами только отображает состояние и шлёт намерения.

**Tech Stack:** TypeScript 5, Node (у пользователя v26), npm workspaces, Express 4, Socket.IO 4 / socket.io-client 4, React 18, react-router-dom 6, Vite 5, qrcode.react 4, Vitest 2, tsx (запуск TS-сервера без сборки), concurrently.

**Spec:** `docs/superpowers/specs/2026-10-18-quiz-buzzer-design.md`

## Global Constraints

- Работает без интернета: никаких CDN, шрифты и медиа — локальные файлы.
- Порт по умолчанию `3000`, переопределяется `PORT`.
- PIN админа: `ADMIN_PIN` из окружения, иначе случайные 4 цифры; печатается в консоль при старте вместе с LAN-адресом.
- Вопросы: `server/data/questions.json`, медиа: `server/data/media/`, отдаются по `/media/<file>`.
- Состояние: `server/data/state.json`, атомарная запись (tmp + rename) после каждого изменения.
- Правильный ответ уходит **только** в админскую проекцию.
- Неверный ответ не штрафует. «Частично» начисляет N и закрывает вопрос.
- Нажимать можно сразу после открытия вопроса. Таймеров нет.
- QR-код на большом экране — только в фазе `lobby`; «Начать игру» → `game`; «Новая игра» → снова `lobby`.
- Регистрация открыта в любой фазе. Имя уникально без учёта регистра и пробелов по краям.
- Весь текст интерфейса — на русском.
- Сообщение о занятом имени: «Это имя уже занято».

## Review Focus

1. **Повреждённый или пустой `state.json`** (свет выключили во время записи) — сервер стартует с чистым состоянием, старый файл переименован в `state.json.bak`, не падает. → тест в Task 4.
2. **Телефон с `playerId`, которого больше нет** (админ удалил игрока или «Новая игра» с удалением) — `player:resume` отвечает `ok:false`, телефон чистит localStorage и показывает форму имени; уже открытые вкладки удалённого игрока получают `player:removed`. → тесты в Task 3 и Task 6.
3. **Мусорное имя**: только пробелы, длиннее 24 символов, «Вася» vs « вася » — пустое и длинное отклоняются (`NAME_EMPTY`, `NAME_TOO_LONG`), регистр/пробелы считаются дублем (`NAME_TAKEN`). → тест в Task 3.
4. **Мусор в числах от админа**: «Частично» с `NaN`, `-5`, `2.5`; правка очков на `0` или `NaN` — отклоняется `INVALID_POINTS`, состояние не меняется. Отрицательная правка очков (`-100`) разрешена. → тест в Task 3.
5. **Две вкладки одного игрока**: закрыл одну — игрок остаётся онлайн; закрыл обе — офлайн. Нажатие из любой вкладки засчитывается один раз. → тест в Task 6.

---

## Структура файлов

```
package.json                 workspaces, скрипты start/dev/test
tsconfig.base.json
shared/
  package.json               name "@quiz/shared", main "src/index.ts"
  src/index.ts               реэкспорт
  src/types.ts               GameState, Player, QuestionPack, проекции, ErrorCode
  src/events.ts              ClientToServerEvents, ServerToClientEvents
server/
  package.json
  data/questions.json        пример пака (2 раунда × 3 темы × 3 вопроса)
  data/media/                пример картинки и аудио
  src/questions.ts           загрузка, валидация, questionId, findQuestion
  src/game/logic.ts          чистые функции игры
  src/persistence.ts         loadState / saveState
  src/views.ts               toPublicView / toAdminView
  src/server.ts              createQuizServer (Express + Socket.IO)
  src/index.ts               точка входа: LAN-IP, PIN, listen
  test/*.test.ts
client/
  package.json
  index.html, vite.config.ts
  src/main.tsx               роутер: / , /screen , /admin
  src/socket.ts              singleton socket + хуки usePublicView/useAdminView
  src/theme.css              оформление «Сумеречный шабаш»
  src/player/buttonState.ts  чистая функция состояния кнопки
  src/player/PlayerPage.tsx
  src/screen/ScreenPage.tsx, Lobby.tsx, Grid.tsx, QuestionView.tsx, Scoreboard.tsx
  src/admin/AdminPage.tsx, AdminGrid.tsx, QuestionControls.tsx, PlayersPanel.tsx
  test/buttonState.test.ts
```

---

### Task 1: Каркас монорепо и общие типы

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `shared/package.json`, `shared/src/index.ts`, `shared/src/types.ts`, `shared/src/events.ts`, `server/package.json`, `server/tsconfig.json`, `server/test/smoke.test.ts`

**Interfaces:**
- Produces (`@quiz/shared`):

```ts
export type Phase = 'lobby' | 'game';
export type QuestionId = string; // `${round}/${theme}/${question}`, напр. "0/1/2"

export interface Question { value: number; text: string; answer: string; image?: string; audio?: string }
export interface Theme { name: string; questions: Question[] }
export interface Round { name: string; themes: Theme[] }
export interface QuestionPack { rounds: Round[] }

export interface Player { id: string; name: string; score: number; online: boolean }
export interface ActiveQuestion { id: QuestionId; answeringPlayerId: string | null; wrongPlayerIds: string[] }
export interface GameState {
  phase: Phase; players: Player[]; playedCells: QuestionId[];
  currentRound: number; activeQuestion: ActiveQuestion | null;
}

export type ErrorCode = 'NAME_EMPTY' | 'NAME_TOO_LONG' | 'NAME_TAKEN' | 'NOT_FOUND'
  | 'WRONG_PHASE' | 'QUESTION_ACTIVE' | 'ALREADY_PLAYED' | 'NO_ACTIVE'
  | 'NO_ANSWERER' | 'CANNOT_BUZZ' | 'INVALID_POINTS' | 'UNAUTHORIZED';
export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export interface CellView { id: QuestionId; value: number; played: boolean }
export interface PublicQuestionView {
  id: QuestionId; themeName: string; value: number; text: string;
  image?: string; audio?: string; answeringPlayerId: string | null; wrongPlayerIds: string[];
}
export interface PublicView {
  phase: Phase; joinUrl: string;
  players: Player[];                       // отсортированы по score desc, затем name
  roundIndex: number; roundNames: string[];
  themes: { name: string; cells: CellView[] }[];   // текущий раунд
  activeQuestion: PublicQuestionView | null;
}
export interface AdminView extends PublicView {
  activeQuestion: (PublicQuestionView & { answer: string }) | null;
}
export type AudioAction = 'play' | 'pause' | 'restart';
export type Ack = (res: { ok: true } | { ok: false; error: ErrorCode }) => void;
```

- `shared/src/events.ts`:

```ts
export interface ClientToServerEvents {
  'player:join': (p: { name: string }, ack: (r: { ok: true; playerId: string } | { ok: false; error: ErrorCode }) => void) => void;
  'player:resume': (p: { playerId: string }, ack: (r: { ok: boolean }) => void) => void;
  'player:buzz': () => void;
  'screen:hello': () => void;
  'admin:auth': (p: { pin: string }, ack: Ack) => void;
  'admin:startGame': (ack: Ack) => void;
  'admin:selectRound': (p: { index: number }, ack: Ack) => void;
  'admin:openQuestion': (p: { id: QuestionId }, ack: Ack) => void;
  'admin:correct': (ack: Ack) => void;
  'admin:wrong': (ack: Ack) => void;
  'admin:partial': (p: { points: number }, ack: Ack) => void;
  'admin:close': (ack: Ack) => void;
  'admin:adjustScore': (p: { playerId: string; delta: number }, ack: Ack) => void;
  'admin:removePlayer': (p: { playerId: string }, ack: Ack) => void;
  'admin:newGame': (p: { removePlayers: boolean }, ack: Ack) => void;
  'admin:audio': (p: { action: AudioAction }, ack: Ack) => void;
}
export interface ServerToClientEvents {
  'state:public': (v: PublicView) => void;
  'state:admin': (v: AdminView) => void;
  'screen:audio': (p: { action: AudioAction }) => void;
  'player:removed': () => void;
}
```

- [ ] **Step 1:** Корневой `package.json`: `"private": true`, `"type": "module"`, `"workspaces": ["shared","server","client"]`, скрипт `"test": "vitest run"` (воркспейсы запускаются из корня, `vitest.workspace.ts` не нужен — достаточно `include: ['server/test/**/*.test.ts','client/test/**/*.test.ts']` в корневом `vitest.config.ts`). `.gitignore`: `node_modules`, `client/dist`, `server/data/state.json*`.
- [ ] **Step 2:** Написать типы выше. `server/package.json` зависит от `@quiz/shared`, `express`, `socket.io`; dev: `tsx`, `@types/express`, `socket.io-client`. Корневые devDependencies: `typescript`, `vitest`, `concurrently`.
- [ ] **Step 3:** Smoke-тест `server/test/smoke.test.ts`: импортирует тип `GameState` из `@quiz/shared`, создаёт объект, `expect(state.phase).toBe('lobby')`.
- [ ] **Step 4:** `npm install && npm test` → 1 passed. `npx tsc -p server --noEmit` → без ошибок.
- [ ] **Step 5:** Commit `chore: scaffold monorepo and shared types`.

---

### Task 2: Загрузка и валидация вопросов

**Files:**
- Create: `server/src/questions.ts`, `server/test/questions.test.ts`, `server/test/fixtures/` (временные файлы создавать в тесте через `fs.mkdtempSync`)

**Interfaces:**
- Produces:
  - `class QuestionsError extends Error`
  - `loadQuestions(questionsPath: string, mediaDir: string): QuestionPack` — бросает `QuestionsError`
  - `questionId(round: number, theme: number, q: number): QuestionId`
  - `findQuestion(pack: QuestionPack, id: QuestionId): { round: Round; theme: Theme; question: Question } | null`

- [ ] **Step 1: Тесты**
  - `loads valid pack` — корректный файл с одним раундом возвращает объект с `rounds[0].themes[0].questions[0].answer === 'Баба Яга'`.
  - `reports missing field with path` — нет `answer` у 3-го вопроса 2-й темы → `toThrow('rounds[0].themes[1].questions[2].answer')`.
  - `reports missing media file` — `"image": "nope.jpg"` → `toThrow(/nope\.jpg/)`.
  - `rejects empty rounds` — `{ "rounds": [] }` → `toThrow(QuestionsError)`.
  - `rejects invalid JSON` — `"{"` → `toThrow(QuestionsError)` с сообщением, содержащим путь к файлу.
  - `findQuestion` — `"0/1/2"` находит вопрос; `"9/9/9"` и `"abc"` → `null`.
- [ ] **Step 2:** `npm test -- questions` → FAIL (модуля нет).
- [ ] **Step 3:** Реализовать. Проверки: `value` — положительное целое; `text`, `answer` — непустые строки; `image`/`audio` — если есть, строка и файл существует в `mediaDir`. Сообщение ошибки: `<путь>: <что не так>` на русском.
- [ ] **Step 4:** `npm test -- questions` → PASS.
- [ ] **Step 5:** Commit `feat(server): load and validate questions pack`.

---

### Task 3: Игровая логика

**Files:**
- Create: `server/src/game/logic.ts`, `server/test/logic.test.ts`

**Interfaces:**
- Consumes: типы из Task 1, `findQuestion`/`questionId` из Task 2.
- Produces (все функции чистые, не мутируют вход):

```ts
initialState(): GameState  // phase 'lobby', пусто, currentRound 0
registerPlayer(s: GameState, name: string, id: string):
  { ok: true; state: GameState; player: Player } | { ok: false; error: ErrorCode }
hasPlayer(s: GameState, id: string): boolean
setOnline(s: GameState, playerId: string, online: boolean): GameState
removePlayer(s: GameState, playerId: string): Result
adjustScore(s: GameState, playerId: string, delta: number): Result
startGame(s: GameState): Result
selectRound(s: GameState, pack: QuestionPack, index: number): Result
openQuestion(s: GameState, pack: QuestionPack, id: QuestionId): Result
buzz(s: GameState, playerId: string): Result
judgeCorrect(s: GameState, pack: QuestionPack): Result
judgeWrong(s: GameState): Result
judgePartial(s: GameState, points: number): Result
closeQuestion(s: GameState): Result
newGame(s: GameState, opts: { removePlayers: boolean }): GameState
```

Правила (из спеки): имя `trim()`, длина 1..24, уникально по `trim().toLowerCase()`; новый игрок `score 0, online true`. `openQuestion` — только в `game`, нет активного, не сыгран, существует, принадлежит `currentRound`. `buzz` — `CANNOT_BUZZ`, если нет вопроса, уже кто-то отвечает, игрок в `wrongPlayerIds` или не существует. `judgeCorrect` — +`value`, клетка в `playedCells`, `activeQuestion = null`. `judgeWrong` — отвечающий в `wrongPlayerIds`, `answeringPlayerId = null`. `judgePartial` — `points` целое ≥ 0, иначе `INVALID_POINTS`; +points, закрыть. `judge*` без отвечающего → `NO_ANSWERER`. `closeQuestion` — клетка сыграна, очки не меняются. `adjustScore` — `delta` ненулевое целое. `removePlayer` отвечающего — `answeringPlayerId = null`, в `wrongPlayerIds` не добавлять. `newGame` — очки 0, `playedCells` пусто, `activeQuestion null`, `currentRound 0`, `phase 'lobby'`, при `removePlayers` — `players: []`.

- [ ] **Step 1: Тесты** (хелпер `pack()` — 2 раунда × 2 темы × 2 вопроса по 100/200; `game()` — состояние в фазе `game` с игроками `a`,`b`,`c`):
  - регистрация: `'  Вася '` → имя `'Вася'`; затем `'вася'` → `NAME_TAKEN`; `'   '` → `NAME_EMPTY`; 25 символов → `NAME_TOO_LONG`; 24 символа — ok; `'🎃'` — ok.
  - `openQuestion` в `lobby` → `WRONG_PHASE`; после `startGame` — ok; повторно другой вопрос → `QUESTION_ACTIVE`; вопрос раунда 1 при `currentRound 0` → `NOT_FOUND`.
  - `buzz`: `a` → `answeringPlayerId 'a'`; затем `b` → `CANNOT_BUZZ`; без вопроса → `CANNOT_BUZZ`.
  - `judgeWrong` после `a`: `wrongPlayerIds ['a']`, `a` снова `CANNOT_BUZZ`, `b` может.
  - `judgeCorrect` после `b` на вопросе 200: `b.score 200`, клетка в `playedCells`, `activeQuestion null`; повторный `openQuestion` той же клетки → `ALREADY_PLAYED`.
  - `judgePartial(50)` → +50 и закрыт; `NaN`, `-5`, `2.5` → `INVALID_POINTS`, состояние то же; `0` — ok.
  - `judgeCorrect` без отвечающего → `NO_ANSWERER`; `closeQuestion` — сыграна, очки не изменились.
  - `adjustScore(a, -100)` → `-100`; `0`/`NaN` → `INVALID_POINTS`; неизвестный id → `NOT_FOUND`.
  - `removePlayer` отвечающего → `answeringPlayerId null`, `wrongPlayerIds` пуст, игрока нет; `hasPlayer` → false.
  - `newGame({removePlayers:false})` → игроки на месте с `score 0`, `phase 'lobby'`; `{removePlayers:true}` → `players []`.
  - иммутабельность: исходный объект после `buzz` не изменился (`expect(s0).toEqual(snapshot)`).
- [ ] **Step 2:** `npm test -- logic` → FAIL.
- [ ] **Step 3:** Реализовать функции.
- [ ] **Step 4:** `npm test -- logic` → PASS.
- [ ] **Step 5:** Commit `feat(server): pure game logic`.

---

### Task 4: Сохранение состояния

**Files:**
- Create: `server/src/persistence.ts`, `server/test/persistence.test.ts`

**Interfaces:**
- Produces:
  - `saveState(path: string, s: GameState): void` — `writeFileSync(path + '.tmp')` + `renameSync`.
  - `loadState(path: string, pack: QuestionPack): GameState | null` — `null`, если файла нет.

Санитизация при загрузке: все `online = false`; из `playedCells` выкинуть id, для которых `findQuestion` = null; `activeQuestion` → `null`, если вопроса нет; `answeringPlayerId` → `null` и `wrongPlayerIds` отфильтрованы, если игроков нет; `currentRound` за пределами пака → 0. Битый/пустой JSON → `renameSync(path, path + '.bak')`, `console.warn`, вернуть `null`.

- [ ] **Step 1: Тесты:** round-trip (save → load равно, кроме `online:false`); удалённый из пака вопрос пропадает из `playedCells`; активный вопрос сохраняется после перезапуска (`activeQuestion.id` тот же); файл `'{"phase":'` → `null` и существует `state.json.bak`; пустой файл → `null`; нет файла → `null`; после `saveState` нет файла `.tmp`.
- [ ] **Step 2:** `npm test -- persistence` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test -- persistence` → PASS.
- [ ] **Step 5:** Commit `feat(server): atomic state persistence`.

---

### Task 5: Проекции состояния

**Files:**
- Create: `server/src/views.ts`, `server/test/views.test.ts`

**Interfaces:**
- Produces:
  - `toPublicView(s: GameState, pack: QuestionPack, joinUrl: string): PublicView`
  - `toAdminView(s: GameState, pack: QuestionPack, joinUrl: string): AdminView`

- [ ] **Step 1: Тесты:** `JSON.stringify(toPublicView(...))` с активным вопросом **не содержит** строку ответа; `toAdminView` содержит `activeQuestion.answer`; `themes` — темы `currentRound`, `played` true для сыгранных; `players` отсортированы (300, 100, 100 → по имени); `roundNames` — все раунды.
- [ ] **Step 2:** `npm test -- views` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test -- views` → PASS.
- [ ] **Step 5:** Commit `feat(server): public and admin views`.

---

### Task 6: Сетевой сервер

**Files:**
- Create: `server/src/server.ts`, `server/src/index.ts`, `server/test/server.test.ts`

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:

```ts
createQuizServer(opts: {
  questionsPath: string; mediaDir: string; statePath: string;
  pin: string; joinUrl: string; clientDist?: string;
}): { httpServer: http.Server; io: Server<ClientToServerEvents, ServerToClientEvents>; close(): Promise<void> }
```

Поведение:
- При подключении сокет сразу получает `state:public`. Комнаты: `admin` (после `admin:auth`), `screen` (после `screen:hello`), `player:<id>` (после join/resume).
- Подключения игрока считаются в `Map<playerId, Set<socketId>>`; онлайн = множество непусто; `setOnline` вызывается только на переходах 0↔1.
- `player:buzz` берёт `playerId` из `socket.data`, не из payload.
- Все `admin:*` кроме `auth` → `UNAUTHORIZED`, если `socket.data.isAdmin` не true.
- Хелпер `apply(result)`: при `ok` — `state = result.state`, `saveState`, разослать `state:public` всем и `state:admin` в комнату `admin`; ack `{ok:true}`, иначе ack с ошибкой.
- `admin:removePlayer` / `admin:newGame({removePlayers:true})`: до рассылки — `player:removed` в комнаты удалённых игроков, очистить их записи в Map.
- `admin:audio` → `screen:audio` в комнату `screen`.
- Express: `/media` → `express.static(mediaDir)`; если есть `clientDist` — статика и SPA-fallback на `index.html` для `/screen`, `/admin`.
- `index.ts`: LAN-IP — первый не-internal IPv4 из `os.networkInterfaces()` (фолбэк `localhost`); `joinUrl = http://<ip>:<port>/`; PIN из `ADMIN_PIN` или `String(randomInt(1000, 10000))`; печатает адрес, `<адрес>screen`, `<адрес>admin` и PIN. Ошибка `QuestionsError` → печать сообщения и `process.exit(1)`.

- [ ] **Step 1: Интеграционные тесты** (`listen(0)`, временная папка, реальные `socket.io-client`):
  - `exactly one buzz wins`: 5 игроков join, админ auth + startGame + openQuestion, все 5 `emit('player:buzz')` одновременно → дождаться следующего `state:public` у всех → у всех один и тот же непустой `answeringPlayerId`.
  - `admin events need auth`: `admin:startGame` без auth → `{ok:false, error:'UNAUTHORIZED'}`; `admin:auth` с неверным PIN → `UNAUTHORIZED`.
  - `answer never reaches public`: после openQuestion последний `state:public` у игрока не содержит текста ответа, `state:admin` — содержит.
  - `two tabs`: два сокета resume одним id; отключить один → игрок `online:true`; второй → `online:false`.
  - `removed player`: админ удаляет игрока → его сокет получает `player:removed`; новый `player:resume` с тем id → `{ok:false}`.
  - `state survives restart`: начислить очки, `close()`, новый `createQuizServer` с тем же `statePath` → в `state:public` очки на месте.
- [ ] **Step 2:** `npm test -- server` → FAIL.
- [ ] **Step 3:** Реализовать `server.ts` и `index.ts`.
- [ ] **Step 4:** `npm test` → все тесты PASS.
- [ ] **Step 5:** Commit `feat(server): socket.io server and entry point`.

---

### Task 7: Каркас клиента, тема, сокет

**Files:**
- Create: `client/package.json`, `client/index.html`, `client/vite.config.ts`, `client/tsconfig.json`, `client/src/main.tsx`, `client/src/socket.ts`, `client/src/theme.css`, `client/public/fonts/` (локальный сказочный шрифт с открытой лицензией, напр. Ruslan Display или Kurale, .woff2)
- Modify: корневой `package.json` (скрипты)

**Interfaces:**
- Produces:
  - `socket: Socket<ServerToClientEvents, ClientToServerEvents>` (singleton, `io()` на текущий origin)
  - `usePublicView(): PublicView | null`
  - `useAdminView(): AdminView | null`
  - `useConnected(): boolean`
  - CSS-переменные: `--bg`, `--bg-2`, `--gold`, `--gold-dim`, `--blood`, `--text`, `--muted`; класс `.btn`, `.card`.

- [ ] **Step 1:** Vite + React; `vite.config.ts` проксирует `/socket.io` (с `ws: true`) и `/media` на `http://localhost:3000`, `server.host: true`.
- [ ] **Step 2:** Роуты `/` → `PlayerPage`, `/screen` → `ScreenPage`, `/admin` → `AdminPage` (пока заглушки с заголовком). Плашка «Нет связи…» в углу, когда `useConnected()` false.
- [ ] **Step 3:** Скрипты в корне: `"dev": "concurrently \"tsx watch server/src/index.ts\" \"npm run dev -w client\""`, `"build": "npm run build -w client"`, `"start": "npm run build && tsx server/src/index.ts"`. `index.ts` передаёт `clientDist: client/dist`.
- [ ] **Step 4:** `npm start` → в консоли адрес и PIN; `curl -s localhost:3000/screen | grep -c '<div id="root">'` → `1`.
- [ ] **Step 5:** Commit `feat(client): scaffold vite app, theme and socket hooks`.

---

### Task 8: Экран игрока

**Files:**
- Create: `client/src/player/buttonState.ts`, `client/src/player/PlayerPage.tsx`, `client/test/buttonState.test.ts`

**Interfaces:**
- Produces: `type ButtonState = 'idle' | 'active' | 'otherAnswering' | 'youAnswering' | 'alreadyWrong'`; `buttonState(view: PublicView, playerId: string): ButtonState`

- [ ] **Step 1: Тесты `buttonState`:** нет вопроса → `idle`; вопрос, никто не отвечает → `active`; отвечает другой → `otherAnswering`; отвечаю я → `youAnswering`; я в `wrongPlayerIds`, никто не отвечает → `alreadyWrong`; я в `wrongPlayerIds`, отвечает другой → `alreadyWrong`.
- [ ] **Step 2:** `npm test -- buttonState` → FAIL.
- [ ] **Step 3:** Реализовать `buttonState`.
- [ ] **Step 4:** `npm test -- buttonState` → PASS.
- [ ] **Step 5:** `PlayerPage`: localStorage-ключ `quiz.playerId`. На каждом `connect` — если id есть, `player:resume`; `ok:false` → удалить ключ, показать форму. Форма: поле имени (`maxLength 24`) и «Войти»; ошибки по кодам: `NAME_TAKEN` → «Это имя уже занято», `NAME_EMPTY` → «Введи имя», `NAME_TOO_LONG` → «Слишком длинное имя». `player:removed` → удалить ключ, форма. После входа: имя, очки, кнопка во весь экран; подписи: `idle` «Ждём вопрос…», `active` «ЗНАЮ!», `otherAnswering` «Отвечает <имя>», `youAnswering` «Ты отвечаешь!», `alreadyWrong` «Ты уже ответил». Нажатие только в `active` → `player:buzz` + `navigator.vibrate?.(50)`.
- [ ] **Step 6:** Ручная проверка: `npm run dev`, открыть `/` в двух вкладках, войти разными именами, второй раз тем же именем → «Это имя уже занято»; перезагрузить вкладку → вход сохранился.
- [ ] **Step 7:** Commit `feat(client): player buzzer page`.

---

### Task 9: Большой экран

**Files:**
- Create: `client/src/screen/ScreenPage.tsx`, `Lobby.tsx`, `Grid.tsx`, `QuestionView.tsx`, `Scoreboard.tsx`

**Interfaces:**
- Consumes: `usePublicView`, `socket`.

- [ ] **Step 1:** `ScreenPage`: пока не нажата «Начать шабаш» — только эта кнопка; по клику — `socket.emit('screen:hello')` (и на каждом `connect` после этого), дальше по `view`: `phase === 'lobby'` → `Lobby`; иначе `activeQuestion` → `QuestionView`, иначе `Grid` + `Scoreboard`.
- [ ] **Step 2:** `Lobby`: `QRCodeSVG` из `qrcode.react` с `view.joinUrl` (≈ 40vh), адрес текстом, список вошедших игроков (офлайн — приглушены).
- [ ] **Step 3:** `Grid`: название раунда, колонки — темы, ячейки — стоимости; сыгранные — погашены. `Scoreboard`: имя + очки, офлайн серым.
- [ ] **Step 4:** `QuestionView`: тема · стоимость, текст крупно, `<img src="/media/…">` если есть; `<audio ref src="/media/…">` если есть, без autoplay; подписка на `screen:audio`: `play` → `play()`, `pause` → `pause()`, `restart` → `currentTime = 0; play()`. При `answeringPlayerId` — крупная плашка «Отвечает <имя>» и аудио на паузу.
- [ ] **Step 5:** Ручная проверка в `npm run dev`: `/screen` показывает QR; телефон (или вкладка) входит — имя появляется в лобби без перезагрузки.
- [ ] **Step 6:** Commit `feat(client): big screen with lobby, grid and question`.

---

### Task 10: Админ-панель

**Files:**
- Create: `client/src/admin/AdminPage.tsx`, `AdminGrid.tsx`, `QuestionControls.tsx`, `PlayersPanel.tsx`

**Interfaces:**
- Consumes: `useAdminView`, `socket`, события `admin:*` из Task 1.

- [ ] **Step 1:** `AdminPage`: форма PIN; PIN хранится в `sessionStorage` (`quiz.adminPin`) и повторно отправляется `admin:auth` на каждом `connect`; неверный PIN → «Неверный PIN». Общий хелпер `call(event, payload?)` показывает ошибку ack тостом.
- [ ] **Step 2:** В `lobby`: список игроков и кнопка «Начать игру» (`admin:startGame`).
- [ ] **Step 3:** `AdminGrid`: переключатель раундов (`admin:selectRound`, недоступен при активном вопросе), клик по несыгранной клетке → `admin:openQuestion`.
- [ ] **Step 4:** `QuestionControls` (при `activeQuestion`): текст, **ответ** (выделен), «Отвечает: <имя>» / «Ждём нажатия», список ошибившихся. Кнопки «Верно», «Неверно», «Частично» + числовое поле, активные только при отвечающем; «Закрыть без ответа» — всегда; аудио ▶ ⏸ ⟲ — если у вопроса есть `audio`.
- [ ] **Step 5:** `PlayersPanel`: для каждого игрока — онлайн-точка, имя, очки, поле числа + «±» (`admin:adjustScore`), «Удалить» с `confirm()`. Внизу «Новая игра» с `confirm()` и чекбоксом «удалить игроков».
- [ ] **Step 6:** Ручная проверка полного цикла в `npm run dev` (админ, экран, 2 игрока): старт → QR исчезает; открыть вопрос → оба жмут, побеждает один; «Неверно» → второй может жать, первый нет; «Частично 50» → +50, клетка гаснет; правка −30; «Новая игра» → снова QR.
- [ ] **Step 7:** Commit `feat(client): admin panel`.

---

### Task 11: Пример пака, оформление и README

**Files:**
- Create: `server/data/questions.json`, `server/data/media/` (1 картинка, 1 короткий mp3 — сгенерированные/свободные), `README.md`
- Modify: `client/src/theme.css` и компоненты (только стили)

- [ ] **Step 1:** Пример пака: 2 раунда × 3 темы × 3 вопроса (100/200/300) в духе страшных русских сказок, хотя бы один вопрос с `image` и один с `audio`. `npm start` стартует без ошибок валидации.
- [ ] **Step 2:** Оформление в стиле «Сумеречного шабаша»: тёмный фон, золото, сказочный шрифт из `client/public/fonts`. Телефон — кнопка под большой палец, без горизонтального скролла на 375px. Экран — читается с 3 м на 16:9.
- [ ] **Step 3:** README на русском: запуск (`npm install`, `npm start`), какие адреса открыть на ТВ и у админа, `ADMIN_PIN`, формат `questions.json` и `media/`, как сбросить игру, совет — запретить сну Mac во время вечеринки; если телефоны не открывают адрес — разрешить входящие подключения для node в брандмауэре macOS.
- [ ] **Step 4:** `npm test` → всё PASS; ручная проверка с реального телефона по Wi-Fi через QR-код.
- [ ] **Step 5:** Commit `feat: sample pack, theme and README`.
