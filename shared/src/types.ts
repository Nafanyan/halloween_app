export type Phase = 'lobby' | 'game';
export type QuestionId = string; // `${round}/${theme}/${question}`, e.g. "0/1/2"

export interface Question { value: number; text: string; answer: string; image?: string; audio?: string }
export interface Theme { name: string; questions: Question[] }
export interface Round { name: string; themes: Theme[] }
export interface QuestionPack { rounds: Round[] }

export interface Player { id: string; name: string; score: number; online: boolean; avatar?: string }
export interface ActiveQuestion { id: QuestionId; answeringPlayerId: string | null; wrongPlayerIds: string[] }
export interface ShopItemInput { name: string; description: string; price: number; quantity: number; hidden: boolean; image?: string }
export interface ShopItem extends ShopItemInput { id: string }
export interface Purchase { id: string; itemId: string; playerId: string; price: number; at: number }
export interface ShopState { open: boolean; items: ShopItem[]; purchases: Purchase[] }
export interface PublicShopItem { id: string; hidden: boolean; price: number; quantity: number; remaining: number; name?: string; description?: string; image?: string }
export interface AdminShopItem extends ShopItem { remaining: number }
export interface PurchaseView { id: string; itemId: string; itemName: string; playerId: string; playerName: string; price: number; at: number }
export interface Trophy { purchaseId: string; item: ShopItem }
export interface PurchasedEvent { purchaseId: string; playerName: string; playerAvatar?: string; item: ShopItem }
export interface GameState {
  phase: Phase; players: Player[]; playedCells: QuestionId[];
  currentRound: number; activeQuestion: ActiveQuestion | null;
  shop: ShopState;
}

export type ErrorCode = 'NAME_EMPTY' | 'NAME_TOO_LONG' | 'NAME_TAKEN' | 'NOT_FOUND'
  | 'WRONG_PHASE' | 'QUESTION_ACTIVE' | 'ALREADY_PLAYED' | 'NO_ACTIVE'
  | 'NO_ANSWERER' | 'CANNOT_BUZZ' | 'INVALID_POINTS' | 'UNAUTHORIZED'
  | 'INVALID_ITEM' | 'SOLD_OUT' | 'NOT_ENOUGH_POINTS' | 'INVALID_IMAGE';
export type Result = { ok: true; state: GameState } | { ok: false; error: ErrorCode };

export interface CellView { id: QuestionId; value: number; played: boolean }
export interface PublicQuestionView {
  id: QuestionId; themeName: string; value: number; text: string;
  image?: string; audio?: string; answeringPlayerId: string | null; wrongPlayerIds: string[];
}
export interface PublicView {
  phase: Phase; joinUrl: string;
  players: Player[];                       // sorted by score desc, then name
  roundIndex: number; roundNames: string[];
  themes: { name: string; cells: CellView[] }[];   // current round
  activeQuestion: PublicQuestionView | null;
  shop: { open: boolean; items: PublicShopItem[] };
}
export interface AdminView extends PublicView {
  activeQuestion: (PublicQuestionView & { answer: string }) | null;
  shop: { open: boolean; items: AdminShopItem[]; purchases: PurchaseView[] };
}
export type AudioAction = 'play' | 'pause' | 'restart';
export type Ack = (res: { ok: true } | { ok: false; error: ErrorCode }) => void;
