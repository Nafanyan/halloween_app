import { useEffect, useState } from 'react';
import { socket, usePublicView, usePurchaseQueue } from '../socket';
import { Lobby } from './Lobby';
import { Grid } from './Grid';
import { Scoreboard } from './Scoreboard';
import { QuestionView } from './QuestionView';
import { Showcase } from '../shop/Showcase';
import { PurchaseReveal } from '../shop/PurchaseReveal';
import './screen.css';

export function ScreenPage() {
  const view = usePublicView();
  const [started, setStarted] = useState(false);
  const purchase = usePurchaseQueue();

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
  if (view.phase === 'lobby') return <div className="screen"><Lobby view={view} /></div>;
  const reveal = purchase.current && (
    <PurchaseReveal key={purchase.current.purchaseId} purchase={purchase.current} onDone={purchase.done} />
  );
  const q = view.activeQuestion;
  return (
    <>
      {q ? (
        <div className="screen">
          <QuestionView key={q.id} question={q} players={view.players} />
        </div>
      ) : (
        <div className="screen screen-game">
          {view.shop.open ? <Showcase items={view.shop.items} size="tv" /> : <Grid view={view} />}
          <Scoreboard players={view.players} />
        </div>
      )}
      {reveal}
    </>
  );
}
