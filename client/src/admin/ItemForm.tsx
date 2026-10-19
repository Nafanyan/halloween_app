import { useState, type FormEvent } from 'react';
import type { AdminShopItem } from '@quiz/shared';
import { call, parseNum, showToast, uploadImage } from './adminApi';
import { downscaleImage } from './image';

export function ItemForm({ initial, onDone }: { initial?: AdminShopItem; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(String(initial?.price ?? 100));
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [image, setImage] = useState<string | undefined>(initial?.image);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      let blob: Blob;
      try {
        blob = await downscaleImage(file);
      } catch {
        showToast('Не удалось прочитать фото');
        return;
      }
      try {
        setImage(await uploadImage(blob));
      } catch (err) {
        const status = (err as { status?: number }).status;
        showToast(status === 413 ? 'Фото слишком большое' : status === 401 ? 'Нет доступа' : 'Не удалось загрузить фото');
      }
    } finally {
      setUploading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseNum(price);
    const q = parseNum(quantity);
    if (p === null || q === null) {
      showToast('Укажите цену и количество');
      return;
    }
    const item = { name, description, price: p, quantity: q, hidden, ...(image ? { image } : {}) };
    setPending(true);
    const onOk = () => {
      if (initial) onDone();
      else {
        setName(''); setDescription(''); setPrice('100'); setQuantity('1'); setHidden(false); setImage(undefined);
      }
    };
    const done = () => setPending(false);
    if (initial) call('admin:itemUpdate', { id: initial.id, item }, onOk, done);
    else call('admin:itemAdd', { item }, onOk, done);
  };

  return (
    <form className="item-form" onSubmit={submit}>
      <h3>{initial ? 'Изменить предмет' : 'Новый предмет'}</h3>
      <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {uploading && <span className="muted">Загрузка фото…</span>}
      {image && (
        <div className="admin-row">
          <img className="item-thumb" src={image} alt="" />
          <button type="button" className="btn" onClick={() => setImage(undefined)}>Убрать фото</button>
        </div>
      )}
      <input type="text" placeholder="Название" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <textarea placeholder="Описание" maxLength={500} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="admin-row">
        <label>Цена <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>Количество <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
        <label><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Закрытый</label>
      </div>
      <div className="admin-row">
        <button className="btn" type="submit" disabled={uploading || pending}>{initial ? 'Сохранить' : 'Добавить'}</button>
        {initial && <button className="btn" type="button" onClick={onDone}>Отмена</button>}
      </div>
    </form>
  );
}
