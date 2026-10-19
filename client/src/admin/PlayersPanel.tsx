import { useState } from 'react';
import type { AdminView } from '@quiz/shared';
import { Avatar } from '../avatar/Avatar';
import { call, parseNum } from './adminApi';

function PlayerRow({ id, name, score, online, avatar }: { id: string; name: string; score: number; online: boolean; avatar?: string }) {
  const [delta, setDelta] = useState('');
  const adjust = () => {
    const n = parseNum(delta);
    if (n !== null) call('admin:adjustScore', { playerId: id, delta: n });
  };
  return (
    <li className="admin-player">
      <span className={online ? 'dot on' : 'dot'} title={online ? 'онлайн' : 'офлайн'} />
      <Avatar name={name} avatar={avatar} size="28px" />
      <span className="admin-pname">
        <span>{name}</span>
        {avatar && <button className="btn" onClick={() => call('admin:clearAvatar', { playerId: id })}>убрать аватар</button>}
      </span>
      <b>{score}</b>
      <input type="number" placeholder="±" value={delta} onChange={(e) => setDelta(e.target.value)} />
      <button className="btn" onClick={adjust}>±</button>
      <button
        className="btn danger"
        onClick={() => { if (confirm(`Удалить игрока ${name}?`)) call('admin:removePlayer', { playerId: id }); }}
      >
        Удалить
      </button>
    </li>
  );
}

export function PlayersPanel({ view }: { view: AdminView }) {
  const [removePlayers, setRemovePlayers] = useState(false);
  return (
    <section className="card">
      <h2>Игроки</h2>
      <ul className="admin-players">
        {view.players.map((p) => <PlayerRow key={p.id} {...p} />)}
      </ul>
      <div className="admin-row admin-newgame">
        <button
          className="btn danger"
          onClick={() => {
            const text = removePlayers ? 'Начать новую игру и удалить всех игроков?' : 'Начать новую игру?';
            if (confirm(text)) call('admin:newGame', { removePlayers }, () => setRemovePlayers(false));
          }}
        >
          Новая игра
        </button>
        <label>
          <input type="checkbox" checked={removePlayers} onChange={(e) => setRemovePlayers(e.target.checked)} /> удалить игроков
        </label>
      </div>
    </section>
  );
}
