import type { EditQuestion, EditTheme } from '@quiz/shared';
import { nextValue } from './edit';
import { QuestionForm } from './QuestionForm';
import { QuestionRow } from './QuestionRow';
import { NameInput } from './NameInput';

interface Props {
  theme: EditTheme;
  gameId: string;
  disabled: boolean;
  first: boolean;
  last: boolean;
  /** индекс открытой формы в этой теме: число, 'new' или null */
  open: number | 'new' | null;
  onOpen: (i: number | 'new' | null) => void;
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSaveQuestion: (i: number | 'new', q: EditQuestion) => void;
  onMoveQuestion: (i: number, dir: -1 | 1) => void;
  onRemoveQuestion: (i: number) => void;
}

export function ThemeBlock(p: Props) {
  const { theme, disabled } = p;
  return (
    <div className="q-theme">
      <div className="admin-row q-head">
        <NameInput value={theme.name} disabled={disabled} onCommit={p.onRename} />
        <button className="btn small" disabled={disabled || p.first} onClick={() => p.onMove(-1)}>↑</button>
        <button className="btn small" disabled={disabled || p.last} onClick={() => p.onMove(1)}>↓</button>
        <button className="btn small danger" disabled={disabled} onClick={p.onRemove}>Удалить тему</button>
      </div>
      {theme.questions.map((q, i) => p.open === i ? (
        <QuestionForm
          key={`${i}-edit`} gameId={p.gameId} initial={q} disabled={disabled}
          onSave={(nq) => p.onSaveQuestion(i, nq)} onCancel={() => p.onOpen(null)}
        />
      ) : (
        <div className="q-question" key={i}>
          <QuestionRow
            q={q} disabled={disabled} first={i === 0} last={i === theme.questions.length - 1}
            onEdit={() => p.onOpen(i)} onMove={(d) => p.onMoveQuestion(i, d)} onRemove={() => p.onRemoveQuestion(i)}
          />
        </div>
      ))}
      {p.open === 'new' ? (
        <QuestionForm
          gameId={p.gameId} initial={{ value: nextValue(theme), text: '', answer: '' }} disabled={disabled}
          onSave={(nq) => p.onSaveQuestion('new', nq)} onCancel={() => p.onOpen(null)}
        />
      ) : (
        <div className="admin-row">
          <button className="btn small" disabled={disabled} onClick={() => p.onOpen('new')}>+ Вопрос</button>
        </div>
      )}
    </div>
  );
}
