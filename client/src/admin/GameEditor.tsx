import type { GameEditView } from '@quiz/shared';
import { call } from './adminApi';
import { SettingsForm } from './SettingsForm';
import { CatalogPanel } from './CatalogPanel';
import { plural } from './plural';

export function GameEditor({ edit }: { edit: GameEditView }) {
  return (
    <>
      <div className="admin-row">
        <button className="btn" onClick={() => call('game:open', { id: null })}>← К списку игр</button>
      </div>
      <h2>{edit.settings.title}</h2>
      <SettingsForm key={edit.id} edit={edit} />
      <CatalogPanel edit={edit} />
      <section className="card">
        <h2>Вопросы</h2>
        <ul className="admin-players">
          {edit.rounds.map((r, i) => (
            <li key={i}>{r.name} — {r.themes} {plural(r.themes, ['тема', 'темы', 'тем'])}, {r.questions} {plural(r.questions, ['вопрос', 'вопроса', 'вопросов'])}</li>
          ))}
        </ul>
        <p className="muted">Редактор вопросов появится позже. Чтобы изменить вопросы: остановите сервер, отредактируйте server/data/games/{edit.id}/game.json и запустите снова — иначе сохранение из админки перезапишет ваши правки.</p>
      </section>
    </>
  );
}
