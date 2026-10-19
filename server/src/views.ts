import type {
  AdminShopItem,
  AdminView,
  CellView,
  GameState,
  PublicQuestionView,
  PublicShopItem,
  PublicView,
  QuestionPack,
  PurchaseView,
  Trophy,
} from '@quiz/shared';
import { questionId, findQuestion } from './questions';
import { remaining } from './game/shop';

const left = (s: GameState, id: string) => Math.max(0, remaining(s, id));

function publicShop(s: GameState): PublicView['shop'] {
  const items = s.shop.items.map((i): PublicShopItem => {
    const base = { id: i.id, hidden: i.hidden, price: i.price, quantity: i.quantity, remaining: left(s, i.id) };
    if (i.hidden) return base;
    return {
      ...base,
      name: i.name,
      description: i.description,
      ...(i.image !== undefined && { image: i.image }),
    };
  });
  return { open: s.shop.open, items };
}

function adminShop(s: GameState): AdminView['shop'] {
  const items = s.shop.items.map((i): AdminShopItem => ({ ...i, remaining: left(s, i.id) }));
  const purchases = s.shop.purchases
    .map((p): PurchaseView => ({
      id: p.id,
      itemId: p.itemId,
      itemName: s.shop.items.find((i) => i.id === p.itemId)?.name ?? '',
      playerId: p.playerId,
      playerName: s.players.find((pl) => pl.id === p.playerId)?.name ?? '',
      price: p.price,
      at: p.at,
    }))
    .sort((a, b) => b.at - a.at);
  return { open: s.shop.open, items, purchases };
}

export function trophiesOf(s: GameState, playerId: string): Trophy[] {
  const out: Trophy[] = [];
  for (const p of s.shop.purchases) {
    if (p.playerId !== playerId) continue;
    const item = s.shop.items.find((i) => i.id === p.itemId);
    if (item) out.push({ purchaseId: p.id, item });
  }
  return out;
}

export function toPublicView(s: GameState, pack: QuestionPack, joinUrl: string): PublicView {
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
        ...(found.question.image !== undefined && { image: found.question.image }),
        ...(found.question.audio !== undefined && { audio: found.question.audio }),
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
    players,
    roundIndex: s.currentRound,
    roundNames: pack.rounds.map((r) => r.name),
    themes,
    activeQuestion,
    shop: publicShop(s),
  };
}

export function toAdminView(s: GameState, pack: QuestionPack, joinUrl: string): AdminView {
  const view = toPublicView(s, pack, joinUrl);
  const found = s.activeQuestion ? findQuestion(pack, s.activeQuestion.id) : null;
  return {
    ...view,
    activeQuestion:
      view.activeQuestion && found
        ? { ...view.activeQuestion, answer: found.question.answer }
        : null,
    shop: adminShop(s),
  };
}
