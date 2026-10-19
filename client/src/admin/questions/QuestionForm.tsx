import { useState } from 'react';
import type { EditQuestion } from '@quiz/shared';
import { parseNum, showToast } from '../adminApi';
import { MediaField } from '../MediaField';

interface Props {
  gameId: string;
  initial: EditQuestion;
  disabled: boolean;
  onSave: (q: EditQuestion) => void;
  onCancel: () => void;
}

export function QuestionForm({ gameId, initial, disabled, onSave, onCancel }: Props) {
  const [value, setValue] = useState(String(initial.value));
  const [text, setText] = useState(initial.text);
  const [answer, setAnswer] = useState(initial.answer);
  const [image, setImage] = useState<string | undefined>(initial.image);
  const [audio, setAudio] = useState<string | undefined>(initial.audio);

  const submit = () => {
    const v = parseNum(value);
    if (v === null || !Number.isInteger(v) || v < 1 || v > 100000 || !text.trim() || !answer.trim()) {
      showToast('Проверьте поля вопроса');
      return;
    }
    const q: EditQuestion = { value: v, text: text.trim(), answer: answer.trim() };
    if (image) {
      q.image = image;
      if (image === initial.image) q.imageUrl = initial.imageUrl;
    }
    if (audio) {
      q.audio = audio;
      if (audio === initial.audio) q.audioUrl = initial.audioUrl;
    }
    onSave(q);
  };

  return (
    <div className="q-form">
      <label>Тип
        <select disabled={disabled} value="normal" onChange={() => undefined}>
          <option value="normal">Обычный</option>
        </select>
      </label>
      <label>Номинал
        <input type="number" disabled={disabled} value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <label>Текст
        <textarea rows={3} maxLength={1000} disabled={disabled} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <label>Ответ
        <input type="text" maxLength={500} disabled={disabled} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </label>
      <MediaField label="Картинка" accept="image" url={initial.imageUrl} gameId={gameId} disabled={disabled} onChange={setImage} />
      <MediaField label="Музыка" accept="audio" url={initial.audioUrl} gameId={gameId} disabled={disabled} onChange={setAudio} />
      <div className="admin-row">
        <button type="button" className="btn" disabled={disabled} onClick={submit}>Сохранить</button>
        <button type="button" className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </div>
  );
}
