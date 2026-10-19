const KEY = 'quiz.playerId';

export function loadPlayerId(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function savePlayerId(id: string | null): void {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ }
}
