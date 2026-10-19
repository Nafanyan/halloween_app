import type { PublicShopItem, ShopItem } from '@quiz/shared';
import './shop.css';

type Size = 'tv' | 'phone' | 'reveal';

function Ornament() {
  return (
    <svg className="ornament" viewBox="0 0 100 100" aria-hidden="true" fill="none" stroke="var(--gold)" strokeLinecap="round">
      <g strokeWidth="1.2">
        <path d="M50 4 96 50 50 96 4 50Z" />
        <path d="M50 14 86 50 50 86 14 50Z" opacity="0.8" />
        <path d="M50 26 74 50 50 74 26 50Z" opacity="0.6" />
        <circle cx="50" cy="50" r="38" strokeDasharray="2 4" opacity="0.7" />
        <path d="M50 4v14M50 82v14M4 50h14M82 50h14" />
        <path d="M18 18l8 8M82 18l-8 8M18 82l8-8M82 82l-8-8" opacity="0.8" />
      </g>
    </svg>
  );
}

export function CardBack({ price, mystery = true }: { price?: number; mystery?: boolean }) {
  return (
    <div className="card-back">
      <Ornament />
      {mystery && <div className="back-mark">?</div>}
      {mystery && <div className="back-caption script">Тайна</div>}
      {price !== undefined && <div className="shop-price">{price} ✶</div>}
    </div>
  );
}

export function ShopCard({ item, size }: { item: PublicShopItem | ShopItem; size: Size }) {
  const sold = 'remaining' in item && item.remaining === 0;
  const cls = `shop-card tarot shop-${size}${sold ? ' sold' : ''}`;
  if (item.name === undefined) {
    return (
      <div className={cls}>
        <CardBack price={item.price} />
        {sold && <div className="stamp">Продано</div>}
      </div>
    );
  }
  const remaining = 'remaining' in item ? item.remaining : undefined;
  return (
    <div className={cls}>
      <div className="shop-photo">
        {item.image ? <img src={item.image} alt="" /> : <Ornament />}
      </div>
      <div className="shop-name">{item.name}</div>
      {item.description && size !== 'tv' && <div className="shop-desc">{item.description}</div>}
      <div className="shop-meta">
        <span className="shop-price">{item.price} ✶</span>
        {remaining !== undefined && <span className="shop-left">осталось {remaining}</span>}
      </div>
      {sold && <div className="stamp">Продано</div>}
    </div>
  );
}
