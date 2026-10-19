import type { AdminView, GameSummary } from '@quiz/shared';
import { call } from './adminApi';
import { plural } from './plural';

function GameCard({ game }: { game: GameSummary }) {
  const remove = () => {
    if (confirm(`Удалить игру «${game.title}»? Файлы игры будут удалены.`)) call('game:delete', { id: game.id });
  };
  const activate = () => {
    if (confirm('Очки и покупки сбросятся, игроки останутся. Продолжить?')) call('game:activate', { id: game.id });
  };
  return (
    <li className="card game-card">
      <h3>{game.title}{game.active && <span className="game-badge">Активна</span>}</h3>
      {game.description && <p className="muted">{game.description}</p>}
      <p className="muted">{game.rounds} {plural(game.rounds, ['раунд', 'раунда', 'раундов'])} · {game.questions} {plural(game.questions, ['вопрос', 'вопроса', 'вопросов'])}</p>
      {game.error && <p className="admin-error">{game.error}</p>}
      <div className="admin-row">
        <button className="btn" onClick={() => call('game:open', { id: game.id })}>Открыть</button>
        <button className="btn" onClick={() => call('game:duplicate', { id: game.id })}>Дублировать</button>
        {!game.active && !game.error && <button className="btn" onClick={activate}>Сделать активной</button>}
        {!game.active && <button className="btn danger" onClick={remove}>Удалить</button>}
      </div>
    </li>
  );
}

export function GamesList({ view }: { view: AdminView }) {
  const create = () => {
    const title = prompt('Название игры');
    if (title === null) return;
    call('game:create', { title }, (res) => {
      if (res.id) call('game:open', { id: res.id });
    });
  };
  return (
    <>
      <div className="admin-row">
        <button className="btn" onClick={create}>+ Новая игра</button>
      </div>
      <ul className="admin-players">
        {view.games.map((g) => <GameCard key={g.id} game={g} />)}
      </ul>
    </>
  );
}
