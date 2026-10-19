export function SoundUnlock({ onClick }: { onClick: () => void }) {
  return (
    <button className="sound-unlock" onClick={onClick}>🔊 Нажмите, чтобы включить звук</button>
  );
}
