import type { AdminView } from '@quiz/shared';
import { call } from './adminApi';

export function AdminGrid({ view }: { view: AdminView }) {
  const active = view.activeQuestion !== null;
  return (
    <section className="card">
      <div className="admin-rounds">
        {view.roundNames.map((n, i) => (
          <button
            key={i} className="btn" disabled={active || i === view.roundIndex}
            onClick={() => call('admin:selectRound', { index: i })}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="admin-grid">
        {view.themes.map((t, i) => (
          <div key={i} className="admin-theme">
            <h3>{t.name}</h3>
            {[...t.cells].sort((a, b) => a.value - b.value).map((c) => (
              <button
                key={c.id} className="btn" disabled={c.played}
                onClick={() => call('admin:openQuestion', { id: c.id })}
              >
                {c.value}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
