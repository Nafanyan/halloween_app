import type { EditQuestion, EditRound } from '@quiz/shared';
import { ThemeBlock } from './ThemeBlock';
import { NameInput } from './NameInput';

export type OpenKey = { r: number; t: number; i: number | 'new' } | null;

interface Props {
  round: EditRound;
  r: number;
  gameId: string;
  disabled: boolean;
  first: boolean;
  last: boolean;
  open: OpenKey;
  onOpen: (k: OpenKey) => void;
  onRename: (name: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddTheme: () => void;
  onRenameTheme: (t: number, name: string) => void;
  onMoveTheme: (t: number, dir: -1 | 1) => void;
  onRemoveTheme: (t: number) => void;
  onSaveQuestion: (t: number, i: number | 'new', q: EditQuestion) => void;
  onMoveQuestion: (t: number, i: number, dir: -1 | 1) => void;
  onRemoveQuestion: (t: number, i: number) => void;
}

export function RoundBlock(p: Props) {
  const { round, r, disabled } = p;
  return (
    <div className="q-round">
      <div className="admin-row q-head">
        <NameInput value={round.name} disabled={disabled} onCommit={p.onRename} />
        <button className="btn small" disabled={disabled || p.first} onClick={() => p.onMove(-1)}>↑</button>
        <button className="btn small" disabled={disabled || p.last} onClick={() => p.onMove(1)}>↓</button>
        <button className="btn small danger" disabled={disabled} onClick={p.onRemove}>Удалить раунд</button>
      </div>
      {round.themes.map((theme, t) => (
        <ThemeBlock
          key={t} theme={theme} gameId={p.gameId} disabled={disabled}
          first={t === 0} last={t === round.themes.length - 1}
          open={p.open && p.open.r === r && p.open.t === t ? p.open.i : null}
          onOpen={(i) => p.onOpen(i === null ? null : { r, t, i })}
          onRename={(name) => p.onRenameTheme(t, name)}
          onMove={(d) => p.onMoveTheme(t, d)}
          onRemove={() => p.onRemoveTheme(t)}
          onSaveQuestion={(i, q) => p.onSaveQuestion(t, i, q)}
          onMoveQuestion={(i, d) => p.onMoveQuestion(t, i, d)}
          onRemoveQuestion={(i) => p.onRemoveQuestion(t, i)}
        />
      ))}
      <div className="admin-row">
        <button className="btn small" disabled={disabled} onClick={p.onAddTheme}>+ Тема</button>
      </div>
    </div>
  );
}
