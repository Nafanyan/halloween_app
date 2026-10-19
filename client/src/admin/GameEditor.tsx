import type { GameEditView } from '@quiz/shared';
import { call } from './adminApi';
import { SettingsForm } from './SettingsForm';
import { CatalogPanel } from './CatalogPanel';
import { QuestionsPanel } from './questions/QuestionsPanel';

export function GameEditor({ edit }: { edit: GameEditView }) {
  return (
    <>
      <div className="admin-row">
        <button className="btn" onClick={() => call('game:open', { id: null })}>← К списку игр</button>
      </div>
      <h2>{edit.settings.title}</h2>
      <SettingsForm key={edit.id} edit={edit} />
      <CatalogPanel edit={edit} />
      <QuestionsPanel edit={edit} />
    </>
  );
}
