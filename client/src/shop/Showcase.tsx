import type { CSSProperties } from 'react';
import type { PublicShopItem } from '@quiz/shared';
import { ShopCard } from './ShopCard';
import './shop.css';

const tvCols = (n: number) => (n <= 5 ? Math.max(n, 1) : n <= 8 ? 4 : n <= 12 ? 6 : 8);

export function Showcase({ items, size }: { items: PublicShopItem[]; size: 'tv' | 'phone' }) {
  const cols = size === 'tv' ? tvCols(items.length) : 2;
  const rows = Math.max(Math.ceil(items.length / cols), 1);
  return (
    <div className={`showcase showcase-${size}`}>
      <h1 className="showcase-title">Лавка</h1>
      {items.length === 0 ? (
        <p className="script showcase-empty">Полки пока пусты</p>
      ) : (
        <div
          className="showcase-grid"
          style={{ '--cols': cols, '--rows': rows } as CSSProperties}
        >
          {items.map((it) => <ShopCard key={it.id} item={it} size={size} />)}
        </div>
      )}
    </div>
  );
}
