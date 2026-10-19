import { useTrophies } from '../socket';
import { ShopCard } from './ShopCard';
import './shop.css';

export function Trophies() {
  const trophies = useTrophies();
  if (trophies.length === 0) return null;
  return (
    <details className="trophies">
      <summary>Твои трофеи ({trophies.length})</summary>
      <div className="trophy-list">
        {trophies.map((t) => <ShopCard key={t.purchaseId} item={t.item} size="phone" />)}
      </div>
    </details>
  );
}
