import { useState } from 'react';
import type { AdminView } from '@quiz/shared';
import { call, parseNum } from './adminApi';

export function QuestionControls({ view }: { view: AdminView }) {
  const q = view.activeQuestion!;
  const [pts, setPts] = useState('');
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const answering = q.answeringPlayerId !== null;
  const partial = () => {
    const n = parseNum(pts);
    if (n !== null) call('admin:partial', { points: n });
  };
  return (
    <section className="card admin-question">
      <h2>{q.themeName} — {q.value}</h2>
      <p>{q.text}</p>
      <p className="admin-answer">Ответ: {q.answer}</p>
      <p>{answering ? `Отвечает: ${name(q.answeringPlayerId!)}` : 'Ждём нажатия'}</p>
      {q.wrongPlayerIds.length > 0 && <p className="muted">Ошиблись: {q.wrongPlayerIds.map(name).join(', ')}</p>}
      <div className="admin-row">
        <button className="btn" disabled={!answering} onClick={() => call('admin:correct')}>Верно</button>
        <button className="btn" disabled={!answering} onClick={() => call('admin:wrong')}>Неверно</button>
      </div>
      <div className="admin-row">
        <input type="number" placeholder="Очки" value={pts} onChange={(e) => setPts(e.target.value)} />
        <button className="btn" disabled={!answering} onClick={partial}>Частично</button>
      </div>
      <div className="admin-row">
        <button className="btn" onClick={() => call('admin:close')}>Закрыть без ответа</button>
        {q.audio && (
          <>
            <button className="btn" aria-label="Играть" onClick={() => call('admin:audio', { action: 'play' })}>▶</button>
            <button className="btn" aria-label="Пауза" onClick={() => call('admin:audio', { action: 'pause' })}>⏸</button>
            <button className="btn" aria-label="Сначала" onClick={() => call('admin:audio', { action: 'restart' })}>⟲</button>
          </>
        )}
      </div>
    </section>
  );
}
