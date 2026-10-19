import { useEffect, useState } from 'react';

/** Поле названия: сохраняется по blur/Enter, если значение изменилось и непустое. */
export function NameInput({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (name: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

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
