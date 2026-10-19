import { useEffect, useState, type CSSProperties } from 'react';
import './avatar.css';

export function Avatar({ name, avatar, size }: { name: string; avatar?: string; size: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  const letter = [...name][0]?.toUpperCase() ?? '';
  return (
    <span className="avatar" style={{ '--avatar-size': size } as CSSProperties}>
      {avatar && !failed ? <img src={avatar} alt="" onError={() => setFailed(true)} /> : letter}
    </span>
  );
}
