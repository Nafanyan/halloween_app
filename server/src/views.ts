import type {
  ActiveGame,
  AdminShopItem,
  AdminView,
  CellView,
  GameEditView,
  GameState,
  GameSummary,
  PublicQuestionView,
  PublicShopItem,
  PublicView,
  PurchaseView,
  ShopItem,
  Trophy,
} from '@quiz/shared';
import { questionId, findQuestion } from './questions';
import { remaining } from './game/shop';
import type { GameEntry } from './games/store';

export const mediaUrl = (gameId: string, file: string): string =>
  `/games/${gameId}/media/${encodeURIComponent(file)}`;

export function clientItem(gameId: string, item: ShopItem): ShopItem {
  return item.image === undefined ? item : { ...item, image: mediaUrl(gameId, item.image) };
}

const left = (s: GameState, game: ActiveGame, id: string) => Math.max(0, remaining(s, game.def.shop, id));

function publicShop(s: GameState, game: ActiveGame): PublicView['shop'] {
  const items = game.def.shop.map((i): PublicShopItem => {
    const base = { id: i.id, hidden: i.hidden, price: i.price, quantity: i.quantity, remaining: left(s, game, i.id) };
    if (i.hidden) return base;
    return {
      ...base,
      name: i.name,
      description: i.description,
      ...(i.image !== undefined && { image: mediaUrl(game.id, i.image) }),
    };
  });
  return { open: s.shop.open, items };
}

const adminItem = (gameId: string, i: ShopItem, rem: number): AdminShopItem => ({
  ...i,
  remaining: rem,
  ...(i.image !== undefined && { imageUrl: mediaUrl(gameId, i.image) }),
});

function adminShop(s: GameState, game: ActiveGame): AdminView['shop'] {
  const items = game.def.shop.map((i) => adminItem(game.id, i, left(s, game, i.id)));
  const purchases = s.shop.purchases
    .map((p): PurchaseView => ({
      id: p.id,
      itemId: p.itemId,
      itemName: game.def.shop.find((i) => i.id === p.itemId)?.name ?? '',
      playerId: p.playerId,
      playerName: s.players.find((pl) => pl.id === p.playerId)?.name ?? '',
      price: p.price,
      at: p.at,
    }))
    .sort((a, b) => b.at - a.at);
  return { open: s.shop.open, items, purchases };
}

export function trophiesOf(s: GameState, game: ActiveGame, playerId: string): Trophy[] {
  const out: Trophy[] = [];
  for (const p of s.shop.purchases) {
    if (p.playerId !== playerId) continue;
    const item = game.def.shop.find((i) => i.id === p.itemId);
    if (item) out.push({ purchaseId: p.id, item: clientItem(game.id, item) });
  }
  return out;
}

export function summarize(entry: GameEntry, activeId: string): GameSummary {
  if ('error' in entry) {
    return { id: entry.id, title: entry.id, description: '', rounds: 0, questions: 0, active: false, error: entry.error };
  }
  const { def } = entry;
  const questions = def.rounds.reduce((n, r) => n + r.themes.reduce((m, t) => m + t.questions.length, 0), 0);
  return {
    id: entry.id, title: def.title, description: def.description,
    rounds: def.rounds.length, questions, active: entry.id === activeId,
  };
}

export function editView(s: GameState, game: ActiveGame, activeId: string): GameEditView {
  const { def, id } = game;
  const active = id === activeId;
  const { title, subtitle, description, lobbyMusic, background, scoring } = def;
  return {
    id, active,
    settings: {
      title, subtitle, description, scoring,
      ...(lobbyMusic !== undefined && { lobbyMusic }),
      ...(background !== undefined && { background }),
    },
    media: {
      ...(lobbyMusic !== undefined && { lobbyMusic: mediaUrl(id, lobbyMusic) }),
      ...(background !== undefined && { background: mediaUrl(id, background) }),
    },
    shop: def.shop.map((i) => adminItem(id, i, active ? left(s, game, i.id) : i.quantity)),
    rounds: def.rounds.map((r) => ({
      name: r.name,
      themes: r.themes.length,
      questions: r.themes.reduce((n, t) => n + t.questions.length, 0),
    })),
  };
}

export function toPublicView(s: GameState, game: ActiveGame, joinUrl: string): PublicView {
  const pack = game.def;
  const round = pack.rounds[s.currentRound];
  const played = new Set(s.playedCells);

  const themes = (round?.themes ?? []).map((theme, t) => ({
    name: theme.name,
    cells: theme.questions.map((q, i): CellView => {
      const id = questionId(s.currentRound, t, i);
      return { id, value: q.value, played: played.has(id) };
    }),
  }));

  let activeQuestion: PublicQuestionView | null = null;
  if (s.activeQuestion) {
    const found = findQuestion(pack, s.activeQuestion.id);
    if (found) {
      const a = s.activeQuestion;
      activeQuestion = {
        id: a.id,
        themeName: found.theme.name,
        value: found.question.value,
        text: found.question.text,
        ...(found.question.image !== undefined && { image: mediaUrl(game.id, found.question.image) }),
        ...(found.question.audio !== undefined && { audio: mediaUrl(game.id, found.question.audio) }),
        answeringPlayerId: a.answeringPlayerId,
        wrongPlayerIds: a.wrongPlayerIds,
      };
    }
  }

  const players = [...s.players].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'),
  );

  return {
    phase: s.phase,
    joinUrl,
    game: {
      id: game.id,
      title: pack.title,
      subtitle: pack.subtitle,
      ...(pack.background !== undefined && { background: mediaUrl(game.id, pack.background) }),
      ...(pack.lobbyMusic !== undefined && { lobbyMusic: mediaUrl(game.id, pack.lobbyMusic) }),
    },
    players,
    roundIndex: s.currentRound,
    roundNames: pack.rounds.map((r) => r.name),
    themes,
    activeQuestion,
    shop: publicShop(s, game),
  };
}

export function toAdminView(
  s: GameState, game: ActiveGame, joinUrl: string, games: GameSummary[], editing: GameEditView | null,
): AdminView {
  const view = toPublicView(s, game, joinUrl);
  const found = s.activeQuestion ? findQuestion(game.def, s.activeQuestion.id) : null;
  return {
    ...view,
    activeQuestion:
      view.activeQuestion && found
        ? { ...view.activeQuestion, answer: found.question.answer }
        : null,
    shop: adminShop(s, game),
    games,
    editing,
  };
}
