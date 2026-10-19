import { useEffect, useRef } from 'react';
import type { Player, PublicQuestionView } from '@quiz/shared';
import { socket } from '../socket';

export function QuestionView({ question, players }: { question: PublicQuestionView; players: Player[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const answerer = players.find((p) => p.id === question.answeringPlayerId);

  useEffect(() => {
    const play = () => { audioRef.current?.play().catch(() => {}); };
    const onAudio = ({ action }: { action: 'play' | 'pause' | 'restart' }) => {
      const a = audioRef.current;
      if (!a) return;
      if (action === 'play') play();
      else if (action === 'pause') a.pause();
      else { a.currentTime = 0; play(); }
    };
    socket.on('screen:audio', onAudio);
    return () => {
      socket.off('screen:audio', onAudio);
    };
  }, []);

  useEffect(() => {
    if (question.answeringPlayerId !== null) audioRef.current?.pause();
  }, [question.answeringPlayerId]);

  return (
    <div className="question">
      <div className="question-head label">{question.themeName} · {question.value}</div>
      <div className="question-text">{question.text}</div>
      {question.image && <img className="question-img" src={`/media/${question.image}`} alt="" />}
      {question.audio && <audio ref={audioRef} src={`/media/${question.audio}`} />}
      {answerer && <div className="answering tarot">Отвечает {answerer.name}</div>}
    </div>
  );
}
