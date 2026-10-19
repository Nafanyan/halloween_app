import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PurchasedEvent } from '@quiz/shared';
import { Avatar } from '../avatar/Avatar';
import { CardBack, ShopCard } from './ShopCard';
import './reveal.css';

const TV_MS = 7000;
const CALM_MS = 3000;
const CALM_FADE_MS = 500;

type Props = { purchase: PurchasedEvent; onDone: () => void };

/** Deterministic particle layout: spread by a golden-ratio step so it looks random but never changes. */
function particles(count: number, delayFrom: number, delaySpan: number) {
  return Array.from({ length: count }, (_, i) => {
    const r = (i * 0.618034) % 1;
    const style = {
      left: `${4 + ((i * 37) % 92)}%`,
      animationDelay: `calc(var(--shift) + ${(delayFrom + r * delaySpan).toFixed(2)}s)`,
      '--drift': `${((i % 5) - 2) * 1.2}vw`,
      '--size': `${0.5 + ((i * 7) % 4) * 0.2}`,
    } as CSSProperties;
    return <span key={i} style={style} />;
  });
}

const SPARKS = particles(18, 1, 1.9);
const DUST = particles(16, 4.4, 0.9);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function Raven({ className }: { className: string }) {
  return (
    <div className={`reveal-raven ${className}`}>
      <svg viewBox="40 0 230 120" aria-hidden="true">
        <g className="rv-wing-far">
          <path d="M170,82 C170,62 166,47 156,34 L159,45 L148,38 L153,49 L141,45 L149,56 L137,56 L149,64 C156,72 161,78 165,86 Z" fill="#0c0908" stroke="rgba(214,170,80,.5)" strokeWidth="1" opacity=".8" />
        </g>
        <path d="M110,90 L60,76 L52,81 L59,84 L47,89 L58,93 L49,99 L61,101 L53,107 L110,98 Z" fill="#0f0b0a" stroke="rgba(214,170,80,.5)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M108,92 C128,80 168,74 196,78 C212,80 222,86 226,92 C214,100 186,106 156,106 C134,106 118,100 108,92 Z" fill="#0f0b0a" stroke="rgba(214,170,80,.5)" strokeWidth="1.2" />
        <path d="M150,104 L145,113 M157,104 L154,113" stroke="#0f0b0a" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M196,76 C202,64 218,60 230,66 C236,69 239,74 238,79 C236,85 232,89 226,91 C218,94 210,93 206,90 Z" fill="#0f0b0a" stroke="rgba(214,170,80,.5)" strokeWidth="1.2" />
        <path d="M234,74 C245,75 256,79 266,84 C256,87 245,89 235,89 C237,84 237,79 234,74 Z" fill="#17110e" stroke="rgba(214,170,80,.5)" strokeWidth="1.1" strokeLinejoin="round" />
        <circle cx="224" cy="72" r="2.3" fill="#e8c06a" />
        <g className="rv-wing-near">
          <path d="M178,82 C172,58 160,38 142,22 C128,10 110,4 92,4 L104,12 L83,10 L100,20 L77,21 L96,30 L73,33 L94,40 L75,47 L100,52 C112,62 124,74 140,88 Z" fill="#110c0b" stroke="rgba(214,170,80,.5)" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

/** Purchase reveal in the invitation style: darkness, ravens, descending card, flash, flip, gold dust. */
export function PurchaseReveal({ purchase, onDone }: Props) {
  const [calm] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(false);
  const finished = useRef(false);
  // Tap-to-dismiss and the timer may both fire; dequeue only once.
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const total = calm ? CALM_MS : TV_MS;
    const timers = [window.setTimeout(finish, total)];
    if (calm) {
      timers.push(window.setTimeout(() => setShown(true), 20));
      timers.push(window.setTimeout(() => setShown(false), total - CALM_FADE_MS));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The timeline runs once per purchase: the parent keys this component by purchaseId.
  }, []);

  const cls = `reveal${calm ? ' reveal-calm' : ''}${calm && shown ? ' shown' : ''}`;
  const title = <div className="reveal-title script"><span className="reveal-who"><Avatar name={purchase.playerName} avatar={purchase.playerAvatar} size="2em" /><span>{purchase.playerName} получает</span></span></div>;

  if (calm) {
    return (
      <div className={cls}>
        <div className="reveal-veil" />
        <div className="reveal-stage">
          {title}
          <div className="reveal-card"><ShopCard item={purchase.item} size="reveal" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="reveal-veil" />
      <div className="reveal-sparks">{SPARKS}</div>
      <div className="reveal-beams" />
      <div className="reveal-stage">
        {title}
        <div className="reveal-drop">
          <div className="reveal-swing">
            <div className="reveal-card reveal-flip">
              <div className="reveal-face reveal-front">
                <div className="shop-card tarot shop-reveal"><CardBack price={purchase.item.price} mystery={purchase.item.hidden} /></div>
              </div>
              <div className="reveal-face reveal-back">
                <ShopCard item={purchase.item} size="reveal" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="reveal-flash" />
      <div className="reveal-dust">{DUST}</div>
      <Raven className="rv-a" />
      <Raven className="rv-b" />
    </div>
  );
}
