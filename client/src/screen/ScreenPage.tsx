import { useEffect, useState } from 'react';
import { socket, usePublicView, usePurchaseQueue } from '../socket';
import { Lobby } from './Lobby';
import { Grid } from './Grid';
import { Scoreboard } from './Scoreboard';
import { QuestionView } from './QuestionView';
import { Showcase } from '../shop/Showcase';
import { PurchaseReveal } from '../shop/PurchaseReveal';
import { useLobbyMusic } from './lobbyMusic';
import { SoundUnlock } from './SoundUnlock';
import './screen.css';

export function ScreenPage() {
  const view = usePublicView();
  const [started, setStarted] = useState(false);
  const purchase = usePurchaseQueue();
  const music = useLobbyMusic(view?.game.lobbyMusic, started && view?.phase === 'lobby');

  useEffect(() => {
    if (!started) return;
    const hello = () => socket.emit('screen:hello');
    hello();
    socket.on('connect', hello);
    return () => {
      socket.off('connect', hello);
    };
  }, [started]);

  if (!started) {
    return (
      <div className="screen screen-start">
        <button className="btn screen-start-btn" onClick={() => setStarted(true)}>Начать шабаш</button>
      </div>
    );
  }
  if (!view) return <div className="screen screen-start"><h1>Зовём духов…</h1></div>;
  const bg = view.game.background;
  const frame = (content: React.ReactNode) => (
    <>
      {bg && (
        <div
          className="screen-bg"
          style={{
            background: `linear-gradient(rgba(18, 13, 11, 0.94) 0%, rgba(18, 13, 11, 0.85) 28%, rgba(18, 13, 11, 0.62) 55%, rgba(18, 13, 11, 0.88) 100%), url("${bg}") center / cover no-repeat`,
          }}
        />
      )}
      {content}
      {music.blocked && <SoundUnlock onClick={music.unlock} />}
    </>
  );
  if (view.phase === 'lobby') return frame(<div className="screen screen-layer"><Lobby view={view} /></div>);
  const reveal = purchase.current && (
    <PurchaseReveal key={purchase.current.purchaseId} purchase={purchase.current} onDone={purchase.done} />
  );
  const q = view.activeQuestion;
  return frame(
    <>
      {q ? (
        <div className="screen screen-layer">
          <QuestionView key={q.id} question={q} players={view.players} />
        </div>
      ) : (
        <div className="screen screen-game screen-layer">
          {view.shop.open ? <Showcase items={view.shop.items} size="tv" /> : <Grid view={view} />}
          <Scoreboard players={view.players} />
        </div>
      )}
      {reveal}
    </>,
  );
}
