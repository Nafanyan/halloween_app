import { QRCodeSVG } from 'qrcode.react';
import type { PublicView } from '@quiz/shared';
import { Avatar } from '../avatar/Avatar';

export function Lobby({ view }: { view: PublicView }) {
  return (
    <div className="lobby">
      <h1>Сумеречный шабаш</h1>
      <p className="script lobby-sub">Наведи телефон на знак — и входи в лес</p>
      <div className="lobby-row">
        <div className="lobby-qr">
          <div className="qr-box tarot"><QRCodeSVG value={view.joinUrl} size={256} style={{ width: '40vh', height: '40vh' }} /></div>
          <div className="join-url">{view.joinUrl}</div>
        </div>
        <div className="lobby-players">
          <h2>Собрались:</h2>
          <ul>
            {view.players.map((p) => (
              <li key={p.id} className={p.online ? '' : 'off'}>
                <Avatar name={p.name} avatar={p.avatar} size="1.8em" />
                <span className="lobby-name">{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
