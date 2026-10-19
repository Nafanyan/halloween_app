import { Fragment } from 'react';
import type { PublicView } from '@quiz/shared';

export function Grid({ view }: { view: PublicView }) {
  const cols = Math.max(0, ...view.themes.map((t) => t.cells.length));
  return (
    <div className="grid-wrap">
      <h1 className="round-name script">{view.roundNames[view.roundIndex]}</h1>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `minmax(0, 1.8fr) repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${view.themes.length}, minmax(0, 1fr))`,
        }}
      >
        {view.themes.map((t, i) => (
          <Fragment key={i}>
            <div className="grid-theme label">{t.name}</div>
            {[...t.cells].sort((a, b) => a.value - b.value).map((c) => (
              <div key={c.id} className={`grid-cell tarot${c.played ? ' played' : ''}`}>{c.played ? '' : c.value}</div>
            ))}
            {Array.from({ length: cols - t.cells.length }, (_, k) => <div key={`empty-${k}`} />)}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
