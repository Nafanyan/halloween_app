# Редактор вопросов — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Конструктор раундов, тем и вопросов в админке вместо ручной правки `game.json`.

**Architecture:** Клиент держит локальную копию `rounds`, изменяет её чистыми функциями (`edit.ts`) и после каждого действия шлёт весь массив событием `game:updateRounds`. Сервер валидирует раунды теми же правилами, что и `game.json`, запрещает правку активной игры в фазе `game` и сохраняет через `GameLibrary`. Админ получает полные вопросы в `GameEditView.rounds`.

**Tech Stack:** TypeScript, Express + socket.io, React + Vite, Vitest. Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-10-19-question-editor-design.md`

## Global Constraints

- `round.name`, `theme.name`: 1–60 символов после trim; `question.value`: целое 1–100000; `question.text`: 1–1000 символов после trim; `question.answer`: 1–500.
- `question.image` — расширение jpg/png/webp/svg; `question.audio` — mp3/ogg/wav/m4a; файл обязан существовать в `games/<id>/media/`.
- `rounds`, `round.themes`, `theme.questions` могут быть пустыми массивами (в `game.json` и в событии). Легаси-миграция `questions.json` по-прежнему требует непустой список раундов.
- Активная игра при `state.phase === 'game'` → `GAME_LOCKED`; в лобби и для неактивных игр правка разрешена.
- Тексты: плашка `Игра идёт — вопросы можно менять в лобби или после «Новой игры»`; тосты `GAME_LOCKED: 'Игра идёт — вопросы можно менять в лобби'`, `INVALID_QUESTIONS: 'Проверьте поля вопроса'`; подтверждения `Удалить раунд «…» со всеми темами и вопросами?`, `Удалить тему «…» со всеми вопросами?`, `Удалить вопрос на <номинал>?`.
- Значения по умолчанию: раунд `Раунд N` (N = новое количество раундов), тема `Новая тема`, номинал нового вопроса — последний в теме + 100, первый — 100.

## Review Focus

1. **Медиа другого типа** — `image: 'x.mp3'` или `audio: 'x.jpg'` → ошибка валидации, а не битая картинка на ТВ. Тест — Task 1.
2. **Правка в лобби после «Новой игры»** — фаза `lobby` у активной игры разрешает правку, `state:public` обновляется (новые темы видны на ТВ). Тест — Task 2.
3. **Пустая тема в активной игре** — не появляется на ТВ пустой колонкой, id остальных клеток не сдвигаются (сыгранные отметки на месте). Тест — Task 2.
4. **Ошибка сервера при сохранении** — клиент откатывает локальное состояние к последнему с сервера, а не показывает несохранённое. Тест — Task 3 (функция отката в `edit.ts` не нужна: откат = взять `edit.rounds`; тестируется ручной проверкой в Task 5, явно).
5. **Перестановка на границах** — ↑ у первого и ↓ у последнего ничего не меняют (возвращают тот же массив). Тест — Task 3.

---

### Task 1: Валидация раундов и типы

**Files:**
- Modify: `server/src/questions.ts`, `server/src/games/validate.ts`, `shared/src/types.ts`
- Test: `server/test/validate.test.ts`, `server/test/questions.test.ts`

**Interfaces:**
- Produces (`questions.ts`): `round(v, p, mediaDir): Round` — темы и вопросы могут быть пустыми; лимиты из Global Constraints; тип медиа по расширению. `loadQuestions` по-прежнему требует непустой `rounds`.
- Produces (`validate.ts`): `parseRounds(raw: unknown, mediaDir: string): Round[]` — бросает `QuestionsError` с путём поля (`rounds[0].themes[1].questions[2].answer: …`); `parseGame` использует её.
- Produces (`types.ts`):
  ```ts
  export interface EditQuestion extends Question { imageUrl?: string; audioUrl?: string }
  export interface EditTheme { name: string; questions: EditQuestion[] }
  export interface EditRound { name: string; themes: EditTheme[] }
  ```
  `GameEditView.rounds: EditRound[]`, `GameEditView.locked: boolean`. `ErrorCode` += `'GAME_LOCKED' | 'INVALID_QUESTIONS'`.

- [ ] **Step 1: Write the failing tests** (`validate.test.ts`, временная `media/` с `a.jpg`, `b.mp3`)
  - `parseRounds([])` → `[]`; `parseRounds([{ name: 'Р', themes: [] }])` → тот же; тема с `questions: []` допустима.
  - `name: ''` → путь `rounds[0].name`; имя из 61 символа → ошибка; из 60 — ок.
  - `value: 0`, `100001`, `1.5` → `…value`; `1` и `100000` — ок.
  - `text` из 1001 символа → `…text`; `answer` из 501 → `…answer`; пробельный `answer` → ошибка.
  - `image: 'b.mp3'` → ошибка в `…image`; `audio: 'a.jpg'` → ошибка в `…audio`; `image: 'a.jpg', audio: 'b.mp3'` — ок; `image: 'нет.jpg'` → `файл не найден`.
  - `parseGame` с пустой темой в раунде проходит.
  - В `questions.test.ts`: `loadQuestions` с `{ rounds: [] }` по-прежнему бросает.
- [ ] **Step 2: Run** `npx vitest run server/test/validate.test.ts server/test/questions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** правила в `questions.ts`, `parseRounds` в `validate.ts`, типы. Наборы расширений — константы `IMAGE_EXTS = ['jpg','png','webp','svg']`, `AUDIO_EXTS = ['mp3','ogg','wav','m4a']` (сравнение без учёта регистра).
- [ ] **Step 4: Run** `npm test` — Expected: PASS (существующие тесты `views`/`server`, которые используют `GameEditView.rounds` как счётчики, — обновить ожидания только если их сломала смена типа; логику представлений меняет Task 2).
- [ ] **Step 5: Commit** `feat: draft-friendly round validation with field limits and media kinds`

---

### Task 2: Сервер — событие `game:updateRounds`, представления

**Files:**
- Modify: `server/src/games/handlers.ts`, `server/src/views.ts`, `shared/src/events.ts`, `server/src/server.ts` (только если `editView` нужен `state.phase`)
- Test: `server/test/server.test.ts`, `server/test/views.test.ts`

**Interfaces:**
- Consumes: `parseRounds` (Task 1), `findGame`, `GameContext` (`handlers.ts`), `mediaUrl` (`views.ts`).
- Produces:
  - `events.ts`: `'game:updateRounds': (p: { id: string; rounds: Round[] }, ack: Ack) => void;`
  - `views.ts`: `editView(s, game, activeId)` возвращает `rounds: EditRound[]` (с `imageUrl`/`audioUrl` через `mediaUrl`) и `locked = game.id === activeId && s.phase === 'game'`; `toPublicView` пропускает темы без вопросов, считая id клеток по исходному индексу темы.
  - Обработчик: порядок проверок `UNAUTHORIZED` → `findGame` (`NOT_FOUND`/`GAME_BROKEN`) → `GAME_LOCKED` → `parseRounds` (`INVALID_QUESTIONS`, `console.warn` с текстом ошибки) → `lib.save({ ...def, rounds })` (`SAVE_FAILED`) → `ctx.changed(id)` → `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**
  - `views`: `editView` отдаёт вопросы с `imageUrl: '/games/g-aaaaaaaa/media/a.jpg'`; `locked` true только для активной игры в фазе `game`; `toPublicView` для раунда `[тема A (пустая), тема B (2 вопроса)]` даёт одну тему `B` с id клеток `0/1/0`, `0/1/1`. (Review Focus 3)
  - `server`: без авторизации → `UNAUTHORIZED`; неизвестный id → `NOT_FOUND`; активная игра после `admin:startGame` → `GAME_LOCKED`, `game.json` не изменился; после `admin:newGame` (фаза `lobby`) → `{ ok: true }` и `state:public.themes` содержит новую тему (Review Focus 2); неактивная игра в фазе `game` → `{ ok: true }`; `rounds` с пустым `answer` → `INVALID_QUESTIONS`; сохранённый `game.json` содержит новые раунды; повторный старт сервера их читает; `game.json`, подменённый каталогом (как в существующем тесте SAVE_FAILED) → `SAVE_FAILED`.
- [ ] **Step 2: Run** `npx vitest run server/test/server.test.ts server/test/views.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** `npm test`, `npx tsc -p server --noEmit` — Expected: PASS, 0 ошибок.
- [ ] **Step 5: Commit** `feat: game:updateRounds event with lock during play`

---

### Task 3: Чистые операции над раундами (`edit.ts`)

**Files:**
- Create: `client/src/admin/questions/edit.ts`
- Test: `client/test/edit.test.ts`

**Interfaces:**
- Consumes: `Round`, `Theme`, `Question` из `@quiz/shared`.
- Produces (все возвращают новый массив, вход не мутируют; при индексе вне диапазона или ходе за границу — возвращают **тот же** объект `rounds`):
  ```ts
  addRound(rounds: Round[]): Round[];                              // name `Раунд ${rounds.length + 1}`, themes []
  renameRound(rounds, r: number, name: string): Round[];
  moveRound(rounds, r: number, dir: -1 | 1): Round[];
  removeRound(rounds, r: number): Round[];
  addTheme(rounds, r: number): Round[];                            // name 'Новая тема', questions []
  renameTheme(rounds, r, t, name): Round[];
  moveTheme(rounds, r, t, dir): Round[];
  removeTheme(rounds, r, t): Round[];
  addQuestion(rounds, r, t, q: Question): Round[];                 // в конец темы
  updateQuestion(rounds, r, t, i, q: Question): Round[];
  moveQuestion(rounds, r, t, i, dir): Round[];
  removeQuestion(rounds, r, t, i): Round[];
  nextValue(theme: Theme): number;                                 // последний value + 100, пустая тема → 100
  stripUrls(rounds: EditRound[]): Round[];                         // убирает imageUrl/audioUrl перед отправкой
  ```

- [ ] **Step 1: Write the failing tests** — по тесту на каждую функцию; `moveRound(rs, 0, -1) === rs` и `moveRound(rs, last, 1) === rs` (Review Focus 5); то же для тем и вопросов; исходный массив не изменён (`Object.freeze` на входе); `nextValue({questions: []}) === 100`, `nextValue` после `[100, 300]` → `400`; `addRound` на двух раундах → имя `Раунд 3`; `stripUrls` убирает поля и оставляет `image`.
- [ ] **Step 2: Run** `npx vitest run client/test/edit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `edit.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat: pure round/theme/question edit operations`

---

### Task 4: Интерфейс раздела «Вопросы»

**Files:**
- Create: `client/src/admin/questions/QuestionsPanel.tsx`, `RoundBlock.tsx`, `ThemeBlock.tsx`, `QuestionRow.tsx`, `QuestionForm.tsx`
- Modify: `client/src/admin/GameEditor.tsx`, `client/src/admin/adminApi.ts`, `client/src/admin/admin.css`, `README.md`

**Interfaces:**
- Consumes: `GameEditView.rounds/locked` (Task 2), `edit.ts` (Task 3), `MediaField` (`client/src/admin/MediaField.tsx`, props `{ label, accept: 'image' | 'audio', url?, gameId, onChange(file | undefined) }` — проверить сигнатуру в файле), `call`, `parseNum`, `showToast`.
- Produces:
  - `QuestionsPanel({ edit }: { edit: GameEditView })`: локальная копия `rounds` (`useState`), сбрасывается на `edit.rounds` при каждом новом `edit.rounds` с сервера; `save(next: Round[])` — ставит локальное состояние и шлёт `call('game:updateRounds', { id: edit.id, rounds: stripUrls(next) }, undefined, …)`; при ошибке (`call` уже показывает тост) — откат к `edit.rounds`.
  - Медиа в форме: `MediaField` возвращает имя файла; превью — URL загрузки или `imageUrl/audioUrl` вопроса.
  - Форма вопроса: «Тип» — `<select>` с одной опцией `Обычный` (disabled не нужен; значение не отправляется); номинал, текст (textarea, maxLength 1000), ответ (maxLength 500); «Сохранить» / «Отмена». Новый вопрос открывается сразу в форме и не создаётся до «Сохранить».
  - Названия раундов/тем — `<input>`, сохраняется по blur/Enter, если значение изменилось и непустое.
  - `locked` → плашка из Global Constraints, все кнопки и поля `disabled`.
  - `adminApi.ts`: сообщения `GAME_LOCKED`, `INVALID_QUESTIONS` из Global Constraints.
  - `GameEditor.tsx`: старый список-сводка и подсказка про `game.json` заменяются на `<QuestionsPanel edit={edit} />`.
  - `README.md`, раздел «Игры»: вопросы собираются в админке (Игры → Открыть → Вопросы); ручная правка `game.json` — как продвинутый вариант, с прежним предупреждением (остановить сервер; сохранение из админки перезаписывает файл; неиспользуемые медиа удаляются при старте).

- [ ] **Step 1: Implement** компоненты, стили (существующие классы `card`, `btn`, `admin-row`, `muted`, `danger`; вложенность раунд → тема → вопрос отступом и тонкой золотой линией слева), сообщения, README.
- [ ] **Step 2: Run** `npm test`, `npx tsc -p client --noEmit`, `npm run build -w client` — Expected: PASS, 0 ошибок, сборка проходит.
- [ ] **Step 3: Commit** `feat: question editor UI in the game editor`

---

### Task 5: Проверка в браузере

- [ ] **Step 1:** `preview_start {name: 'quiz-win'}`, `/admin` (PIN `1234`), «Игры» → «+ Новая игра» «Проверка вопросов» → «Открыть».
- [ ] **Step 2:** «+ Раунд», две темы, по два вопроса; одному — картинка, другому — музыка; переименовать тему; переставить вопросы и темы ↑ ↓; удалить вопрос. После каждого шага строки в UI совпадают с `game.json` на диске.
- [ ] **Step 3:** Вопрос с пустым ответом → кнопка «Сохранить» даёт тост «Проверьте поля вопроса», локальное состояние откатилось (Review Focus 4).
- [ ] **Step 4:** Сделать игру активной, войти игроком, «Начать игру» → раздел «Вопросы» только для чтения с плашкой; открыть вопрос с картинкой на ТВ — картинка видна. «Новая игра» → правка снова доступна.
- [ ] **Step 5:** Очистка: вернуть «Сумеречный шабаш» активной, удалить тестовую игру, остановить сервер, удалить сгенерированный `state.json` (если его не было до проверки). Консоль без ошибок; скриншот редактора — пользователю.
