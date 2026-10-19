import { createContext, useContext, useEffect, useState } from 'react';

/** Растёт при откате отклонённой правки — поля названий сбрасывают введённый текст. */
export const NameRevision = createContext(0);

/** Поле названия: сохраняется по blur/Enter, если значение изменилось и непустое. */
export function NameInput({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (name: string) => void }) {
  const [text, setText] = useState(value);
  const rev = useContext(NameRevision);
  useEffect(() => setText(value), [value, rev]);

  const commit = () => {
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else setText(value);
  };

  return (
    <input
      type="text" maxLength={60} disabled={disabled} value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}
