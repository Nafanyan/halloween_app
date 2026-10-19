import { useState } from 'react';
import type { AdminShopItem, GameEditView } from '@quiz/shared';
import { call } from './adminApi';
import { ItemForm } from './ItemForm';

export function CatalogPanel({ edit }: { edit: GameEditView }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = edit.shop.find((i) => i.id === editingId);

  const remove = (item: AdminShopItem) => {
    const text = edit.active && item.remaining < item.quantity
      ? 'Предмет уже покупали, очки не вернутся. Удалить?'
      : `Удалить «${item.name}»?`;
    if (confirm(text)) call('admin:itemDelete', { gameId: edit.id, id: item.id });
  };

  return (
    <section className="card">
      <h2>Лавка</h2>
      {editing
        ? <ItemForm key={editing.id} gameId={edit.id} initial={editing} onDone={() => setEditingId(null)} />
        : <ItemForm gameId={edit.id} onDone={() => {}} />}
      <ul className="admin-players">
        {edit.shop.map((i) => (
          <li key={i.id} className="shop-item">
            <div className="admin-row shop-item-head">
              {i.imageUrl ? <img className="item-thumb" src={i.imageUrl} alt="" /> : <span className="item-thumb" />}
              <span className="admin-pname">{i.hidden && '🔒 '}{i.name}</span>
              <b>{i.price}</b>
              <span className="muted">× {i.quantity}</span>
              <button className="btn" onClick={() => setEditingId(i.id)}>Изменить</button>
              <button className="btn danger" onClick={() => remove(i)}>Удалить</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
