import { useState, type FormEvent } from 'react';
import type { GameEditView, GameSettings } from '@quiz/shared';
import { call, parseNum, showToast } from './adminApi';
import { MediaField } from './MediaField';

export function SettingsForm({ edit }: { edit: GameEditView }) {
  const s = edit.settings;
  const [title, setTitle] = useState(s.title);
  const [subtitle, setSubtitle] = useState(s.subtitle);
  const [description, setDescription] = useState(s.description);
  const [wrongPenalty, setWrongPenalty] = useState(s.scoring.wrongPenalty);
  const [startScore, setStartScore] = useState(String(s.scoring.startScore));
  const [lobbyMusic, setLobbyMusic] = useState<string | undefined>(s.lobbyMusic);
  const [background, setBackground] = useState<string | undefined>(s.background);
  const [pending, setPending] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const start = parseNum(startScore);
    if (start === null) {
      showToast('Укажите стартовые очки');
      return;
    }
    // Cleared media is sent by omitting the key.
    const settings: GameSettings = {
      title, subtitle, description,
      scoring: { wrongPenalty, startScore: start },
      ...(lobbyMusic ? { lobbyMusic } : {}),
      ...(background ? { background } : {}),
    };
    setPending(true);
    call('game:updateSettings', { id: edit.id, settings }, () => showToast('Сохранено'), () => setPending(false));
  };

  return (
    <form className="item-form" onSubmit={submit}>
      <h3>Настройки</h3>
      <input type="text" placeholder="Название" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input type="text" placeholder="Подзаголовок" maxLength={120} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      <textarea placeholder="Описание" maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <MediaField label="Фон" accept="image" url={edit.media.background} gameId={edit.id} onChange={setBackground} />
      <MediaField label="Музыка в лобби" accept="audio" url={edit.media.lobbyMusic} gameId={edit.id} onChange={setLobbyMusic} />
      <div className="admin-row">
        <label><input type="checkbox" checked={wrongPenalty} onChange={(e) => setWrongPenalty(e.target.checked)} /> Снимать очки за неверный ответ</label>
        <label>Стартовые очки <input type="number" value={startScore} onChange={(e) => setStartScore(e.target.value)} /></label>
      </div>
      <div className="admin-row">
        <button className="btn" type="submit" disabled={pending}>Сохранить</button>
      </div>
    </form>
  );
}
