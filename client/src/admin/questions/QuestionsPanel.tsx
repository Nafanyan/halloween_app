import { useEffect, useRef, useState } from 'react';
import type { EditQuestion, EditRound, GameEditView } from '@quiz/shared';
import { call } from '../adminApi';
import {
  addQuestion, addRound, addTheme, moveQuestion, moveRound, moveTheme, removeQuestion, removeRound,
  removeTheme, renameRound, renameTheme, stripUrls, updateQuestion,
} from './edit';
import { NameRevision } from './NameInput';
import { RoundBlock, type OpenKey } from './RoundBlock';

export function QuestionsPanel({ edit }: { edit: GameEditView }) {
  const [rounds, setRounds] = useState<EditRound[]>(edit.rounds);
  const [open, setOpen] = useState<OpenKey>(null);
  const latest = useRef(edit.rounds);
  latest.current = edit.rounds;
  const [rev, setRev] = useState(0);
  const disabled = edit.locked;

  // Новая версия с сервера заменяет локальную; открытая форма держит своё состояние сама.
  const local = useRef(rounds);
  local.current = rounds;
  useEffect(() => {
    // Если сервер прислал не то, что у нас (правка с другой вкладки), форма уже привязана к чужому индексу — закрываем.
    if (JSON.stringify(stripUrls(edit.rounds)) !== JSON.stringify(stripUrls(local.current))) setOpen(null);
    setRounds(edit.rounds);
  }, [edit.rounds]);

  const save = (next: EditRound[], onOk?: () => void) => {
    if (next === rounds) return;
    setRounds(next);
    let ok = false;
    call('game:updateRounds', { id: edit.id, rounds: stripUrls(next) }, () => { ok = true; onOk?.(); }, () => {
      if (!ok) { setRounds(latest.current); setRev((v) => v + 1); }
    });
  };

  const saveQuestion = (r: number, t: number, i: number | 'new', q: EditQuestion) => {
    // Форма закрывается только после ok; при отказе остаётся с введёнными полями.
    save(i === 'new' ? addQuestion(rounds, r, t, q) : updateQuestion(rounds, r, t, i, q), () => setOpen(null));
  };

  return (
    <NameRevision.Provider value={rev}>
    <section className="card q-panel">
      <h2>Вопросы</h2>
      {disabled && <p className="q-locked">Игра идёт — вопросы можно менять в лобби или после «Новой игры»</p>}
      {rounds.map((round, r) => (
        <RoundBlock
          key={r} round={round} r={r} gameId={edit.id} disabled={disabled}
          first={r === 0} last={r === rounds.length - 1} open={open} onOpen={setOpen}
          onRename={(name) => save(renameRound(rounds, r, name))}
          onMove={(d) => { setOpen(null); save(moveRound(rounds, r, d)); }}
          onRemove={() => {
            if (!confirm(`Удалить раунд «${round.name}» со всеми темами и вопросами?`)) return;
            setOpen(null); save(removeRound(rounds, r));
          }}
          onAddTheme={() => save(addTheme(rounds, r))}
          onRenameTheme={(t, name) => save(renameTheme(rounds, r, t, name))}
          onMoveTheme={(t, d) => { setOpen(null); save(moveTheme(rounds, r, t, d)); }}
          onRemoveTheme={(t) => {
            if (!confirm(`Удалить тему «${round.themes[t].name}» со всеми вопросами?`)) return;
            setOpen(null); save(removeTheme(rounds, r, t));
          }}
          onSaveQuestion={(t, i, q) => saveQuestion(r, t, i, q)}
          onMoveQuestion={(t, i, d) => { setOpen(null); save(moveQuestion(rounds, r, t, i, d)); }}
          onRemoveQuestion={(t, i) => {
            if (!confirm(`Удалить вопрос на ${round.themes[t].questions[i].value}?`)) return;
            setOpen(null); save(removeQuestion(rounds, r, t, i));
          }}
        />
      ))}
      <div className="admin-row">
        <button className="btn" disabled={disabled} onClick={() => { setOpen(null); save(addRound(rounds)); }}>+ Раунд</button>
      </div>
    </section>
    </NameRevision.Provider>
  );
}
