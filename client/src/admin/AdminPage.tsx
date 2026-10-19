import { useEffect, useState, type FormEvent } from 'react';
import { socket, useAdminView } from '../socket';
import { loadPin, savePin, useToast } from './adminApi';
import { AdminGrid } from './AdminGrid';
import { QuestionControls } from './QuestionControls';
import { PlayersPanel } from './PlayersPanel';
import { ShopPanel } from './ShopPanel';
import { GamesList } from './GamesList';
import { GameEditor } from './GameEditor';
import { call } from './adminApi';
import './admin.css';

export function AdminPage() {
  const view = useAdminView();
  const toast = useToast();
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'host' | 'games'>('host');

  const auth = (p: string, manual: boolean) => {
    socket.emit('admin:auth', { pin: p }, (res) => {
      if (res.ok) {
        savePin(p);
        setAuthed(true);
        setError('');
      } else {
        savePin(null);
        setAuthed(false);
        if (manual) setError('Неверный PIN');
      }
    });
  };

  useEffect(() => {
    const onConnect = () => {
      const p = loadPin();
      if (p) auth(p, false);
    };
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => { socket.off('connect', onConnect); };
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pin) auth(pin, true);
  };

  if (!authed || !view) {
    return (
      <main className="admin">
        <form className="card admin-login" onSubmit={submit}>
          <h1>Ведущий</h1>
          <input
            type="password" inputMode="numeric" autoFocus placeholder="PIN"
            value={pin} onChange={(e) => setPin(e.target.value)}
          />
          <button className="btn" type="submit">Войти</button>
          {error && <p className="admin-error">{error}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="admin">
      <h1>Ведущий</h1>
      <nav className="admin-tabs">
        <button className={tab === 'host' ? 'active' : ''} onClick={() => setTab('host')}>Ведущий</button>
        <button className={tab === 'games' ? 'active' : ''} onClick={() => setTab('games')}>Игры</button>
      </nav>
      {tab === 'host' ? (
        <>
        {view.phase === 'lobby' && (
          <section className="card">
            <h2>Лобби</h2>
            <p>{view.players.length ? view.players.map((p) => p.name).join(', ') : 'Игроков пока нет'}</p>
            <button className="btn" onClick={() => call('admin:startGame')}>Начать игру</button>
          </section>
        )}
        {view.phase === 'game' && (
          <>
            {view.activeQuestion && <QuestionControls view={view} />}
            <AdminGrid view={view} />
          </>
        )}
        <PlayersPanel view={view} />
        <ShopPanel view={view} />
        </>
      ) : view.editing ? <GameEditor edit={view.editing} /> : <GamesList view={view} />}
      {toast && <div className="admin-toast">{toast}</div>}
    </main>
  );
}
