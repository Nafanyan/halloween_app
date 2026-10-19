import { useState } from 'react';
import type { AdminShopItem, AdminView } from '@quiz/shared';
import { call } from './adminApi';
import { ItemForm } from './ItemForm';

function ItemRow({ item, view, onEdit }: { item: AdminShopItem; view: AdminView; onEdit: () => void }) {
  const [selling, setSelling] = useState(false);
  const [pending, setPending] = useState(false);
  const sold = view.shop.purchases.some((p) => p.itemId === item.id);

  const sell = (playerId: string, playerName: string) => {
    if (pending || !confirm(`Продать «${item.name}» — ${playerName}?`)) return;
    setPending(true);
    call('admin:sell', { itemId: item.id, playerId }, () => setSelling(false), () => setPending(false));
  };
  const remove = () => {
    const text = sold ? 'Предмет уже покупали, очки не вернутся. Удалить?' : `Удалить «${item.name}»?`;
    if (confirm(text)) call('admin:itemDelete', { id: item.id });
  };

  return (
    <li className="shop-item">
      <div className="admin-row shop-item-head">
        {item.image ? <img className="item-thumb" src={item.image} alt="" /> : <span className="item-thumb" />}
        <span className="admin-pname">{item.hidden && '🔒 '}{item.name}</span>
        <b>{item.price}</b>
        <span className="muted">осталось {item.remaining} из {item.quantity}</span>
        <button className="btn" disabled={item.remaining <= 0} onClick={() => setSelling(!selling)}>Продать</button>
        <button className="btn" onClick={onEdit}>Изменить</button>
        <button className="btn danger" onClick={remove}>Удалить</button>
      </div>
      {selling && (
        <div className="admin-row">
          {view.players.map((p) => (
            <button key={p.id} className="btn" disabled={pending || p.score < item.price} onClick={() => sell(p.id, p.name)}>
              {p.name} ({p.score})
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

export function ShopPanel({ view }: { view: AdminView }) {
  const { shop } = view;
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = shop.items.find((i) => i.id === editingId);
  const canOpen = view.phase === 'game' && !view.activeQuestion;

  return (
    <section className="card">
      <h2>Лавка</h2>
      <button
        className="btn"
        disabled={!shop.open && !canOpen}
        onClick={() => call('admin:shopOpen', { open: !shop.open })}
      >
        {shop.open ? 'Закрыть лавку' : 'Открыть лавку'}
      </button>
      {editing ? <ItemForm key={editing.id} initial={editing} onDone={() => setEditingId(null)} /> : <ItemForm onDone={() => {}} />}
      <ul className="admin-players">
        {shop.items.map((i) => <ItemRow key={i.id} item={i} view={view} onEdit={() => setEditingId(i.id)} />)}
      </ul>
      {shop.purchases.length > 0 && (
        <>
          <h3 className="shop-log-title">Журнал покупок</h3>
          <ul className="admin-players">
            {shop.purchases.map((p) => (
              <li key={p.id} className="admin-row">
                <span className="admin-pname">{p.playerName} — {p.itemName} — {p.price}</span>
                <button
                  className="btn"
                  onClick={() => { if (confirm(`Отменить покупку «${p.itemName}» — ${p.playerName}?`)) call('admin:cancelPurchase', { purchaseId: p.id }); }}
                >
                  Отменить
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
