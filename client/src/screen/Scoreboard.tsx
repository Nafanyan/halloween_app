import type { CSSProperties } from 'react';
import type { Player } from '@quiz/shared';
import { Avatar } from '../avatar/Avatar';

/** Bigger chips for small parties; ~20 names still fit in a few rows. */
const scoreSize = (n: number) => (n <= 8 ? '3vw' : n <= 14 ? '2.6vw' : '2.2vw');

export function Scoreboard({ players }: { players: Player[] }) {
  return (
    <div className="scoreboard" style={{ '--score-size': scoreSize(players.length) } as CSSProperties}>
      {players.map((p) => (
        <div key={p.id} className={`score${p.online ? '' : ' off'}`}>
          <Avatar name={p.name} avatar={p.avatar} size="1.5em" />
          <span className={`score-name${[...p.name].length > 14 ? ' long' : ''}`}>{p.name}</span>
          <span className="score-pts">{p.score}</span>
        </div>
      ))}
    </div>
  );
}
