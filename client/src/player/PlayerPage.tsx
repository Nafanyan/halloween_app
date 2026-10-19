import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { socket, usePublicView } from '../socket';
import { buttonState, type ButtonState } from './buttonState';
import { loadPlayerId as load, savePlayerId as save } from './playerId';
import { Trophies } from '../shop/Trophies';
import { Avatar } from '../avatar/Avatar';
import { avatarBlob } from '../avatar/crop';
import './player.css';

const ERRORS: Record<string, string> = {
  NAME_TAKEN: 'Это имя уже занято',
  NAME_EMPTY: 'Введи имя',
  NAME_TOO_LONG: 'Слишком длинное имя',
};

const PHOTO_ERROR = 'Не удалось загрузить фото';

/** Resolves true when the server accepted the avatar change; false on an undecodable image or a server refusal. */
async function sendAvatar(file: File | null): Promise<boolean> {
  try {
    const image = file ? await (await avatarBlob(file)).arrayBuffer() : null;
    return await new Promise<boolean>((resolve) => {
      socket.emit('player:setAvatar', { image }, (r) => resolve(r.ok));
    });
  } catch {
    return false;
  }
}

export function PlayerPage() {
  const view = usePublicView();
  const [playerId, setPlayerId] = useState<string | null>(load);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photo) { setPreview(undefined); return; }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(''), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const apply = async (file: File | null) => {
    if (!(await sendAvatar(file))) setNotice(PHOTO_ERROR);
  };

  useEffect(() => {
    const resume = () => {
      const id = load();
      if (!id) return;
      socket.emit('player:resume', { playerId: id }, (r) => {
        if (r.ok) setPlayerId(id);
        else { save(null); setPlayerId(null); }
      });
    };
    const removed = () => { save(null); setPlayerId(null); };
    socket.on('connect', resume);
    socket.on('player:removed', removed);
    if (socket.connected) resume();
    return () => {
      socket.off('connect', resume);
      socket.off('player:removed', removed);
    };
  }, []);

  const join = (e: FormEvent) => {
    e.preventDefault();
    socket.emit('player:join', { name }, (r) => {
      if (r.ok) {
        save(r.playerId); setPlayerId(r.playerId); setError('');
        if (photo) { void apply(photo); setPhoto(null); }
      }
      else setError(ERRORS[r.error] ?? 'Не удалось войти');
    });
  };

  if (!playerId) {
    return (
      <form className="player player-join" onSubmit={join}>
        <h1>Сумеречный шабаш</h1>
        <p className="script player-sub">Назовись, путник</p>
        <input value={name} maxLength={24} placeholder="Твоё имя" onChange={(e) => setName(e.target.value)} />
        {photo ? (
          <div className="player-photo">
            <Avatar name={name} avatar={preview} size="72px" />
            <button className="btn ghost" type="button" onClick={() => setPhoto(null)}>Убрать</button>
          </div>
        ) : (
          <label className="btn ghost">
            Выбрать фото
            <input type="file" accept="image/*" hidden onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </label>
        )}
        <div className="err">{error}</div>
        <button className="btn" type="submit">Войти</button>
      </form>
    );
  }

  const me = view?.players.find((p) => p.id === playerId);
  const state: ButtonState = view ? buttonState(view, playerId) : 'idle';
  const answeringName = view?.players.find((p) => p.id === view.activeQuestion?.answeringPlayerId)?.name ?? '';
  const labels: Record<ButtonState, string> = {
    idle: 'Ждём вопрос…',
    active: 'ЗНАЮ!',
    otherAnswering: `Отвечает ${answeringName}`,
    youAnswering: 'Ты отвечаешь!',
    alreadyWrong: 'Ты уже ответил',
  };
  const buzz = () => {
    if (state !== 'active') return;
    socket.emit('player:buzz');
    navigator.vibrate?.(50);
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void apply(file);
  };

  return (
    <div className="player">
      <div className="player-head">
        <button className="player-avatar" type="button" aria-label="Фото" onClick={() => setMenuOpen((o) => !o)}>
          <Avatar name={me?.name ?? ''} avatar={me?.avatar} size="40px" />
        </button>
        <span className="player-name">{me?.name ?? ''}</span>
        <span className="player-score">{me?.score ?? 0}</span>
        {menuOpen && (
          <>
            <div className="player-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="player-menu">
              <button type="button" onClick={() => { setMenuOpen(false); fileInput.current?.click(); }}>Сменить фото</button>
              {me?.avatar && <button type="button" onClick={() => { setMenuOpen(false); void apply(null); }}>Убрать</button>}
            </div>
          </>
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
      </div>
      {notice && <div className="player-notice">{notice}</div>}
      <button className={`buzz tarot ${state}`} onClick={buzz} disabled={state !== 'active'}>{labels[state]}</button>
      <Trophies />
    </div>
  );
}
