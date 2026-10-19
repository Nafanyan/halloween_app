import type { EditQuestion } from '@quiz/shared';

interface Props {
  q: EditQuestion;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

export function QuestionRow({ q, disabled, first, last, onEdit, onMove, onRemove }: Props) {
  return (
    <div className="admin-row">
      <strong>{q.value}</strong>
      <span className="q-text">{q.text}</span>
      <span className="muted">{q.image ? 'img ' : ''}{q.audio ? 'mp3' : ''}</span>
      <button className="btn small" disabled={disabled || first} onClick={() => onMove(-1)}>↑</button>
      <button className="btn small" disabled={disabled || last} onClick={() => onMove(1)}>↓</button>
      <button className="btn small" disabled={disabled} onClick={onEdit}>Изменить</button>
      <button className="btn small danger" disabled={disabled} onClick={onRemove}>Удалить</button>
    </div>
  );
}
