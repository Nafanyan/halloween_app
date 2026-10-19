import type {
  Ack, AdminView, AudioAction, ErrorCode, PublicView, PurchasedEvent, QuestionId, ShopItemInput, Trophy,
} from './types';

export interface ClientToServerEvents {
  'player:join': (p: { name: string }, ack: (r: { ok: true; playerId: string } | { ok: false; error: ErrorCode }) => void) => void;
  'player:resume': (p: { playerId: string }, ack: (r: { ok: boolean }) => void) => void;
  'player:buzz': () => void;
  'player:setAvatar': (p: { image: ArrayBuffer | null }, ack: (r: { ok: true } | { ok: false; error: ErrorCode }) => void) => void;
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
  'admin:clearAvatar': (p: { playerId: string }, ack: Ack) => void;
  'admin:newGame': (p: { removePlayers: boolean }, ack: Ack) => void;
  'admin:audio': (p: { action: AudioAction }, ack: Ack) => void;
  'admin:shopOpen': (p: { open: boolean }, ack: Ack) => void;
  'admin:itemAdd': (p: { item: ShopItemInput }, ack: Ack) => void;
  'admin:itemUpdate': (p: { id: string; item: ShopItemInput }, ack: Ack) => void;
  'admin:itemDelete': (p: { id: string }, ack: Ack) => void;
  'admin:sell': (p: { itemId: string; playerId: string }, ack: Ack) => void;
  'admin:cancelPurchase': (p: { purchaseId: string }, ack: Ack) => void;
}
export interface ServerToClientEvents {
  'state:public': (v: PublicView) => void;
  'state:admin': (v: AdminView) => void;
  'screen:audio': (p: { action: AudioAction }) => void;
  'player:removed': () => void;
  'player:trophies': (t: Trophy[]) => void;
  'shop:purchased': (p: PurchasedEvent) => void;
}
