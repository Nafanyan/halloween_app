import { useState } from 'react';
import { showToast, uploadErrorMessage, uploadMedia } from './adminApi';
import { downscaleImage } from './image';

interface Props {
  label: string;
  accept: 'image' | 'audio';
  url?: string;
  gameId: string;
  onChange: (file: string | undefined) => void;
}

export function MediaField({ label, accept, url, gameId, onChange }: Props) {
  const [preview, setPreview] = useState<string | undefined>(url);
  const [uploading, setUploading] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      let blob: Blob = file;
      if (accept === 'image' && file.type !== 'image/svg+xml') {
        try {
          blob = await downscaleImage(file, 1920);
        } catch {
          showToast('Не удалось прочитать фото');
          return;
        }
      }
      try {
        const res = await uploadMedia(gameId, blob);
        setPreview(res.url);
        onChange(res.file);
      } catch (err) {
        showToast(uploadErrorMessage((err as { status?: number }).status));
      }
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    setPreview(undefined);
    onChange(undefined);
  };

  return (
    <div className="media-field">
      <span>{label}</span>
      <input
        type="file" accept={accept === 'image' ? 'image/*' : 'audio/*'} disabled={uploading}
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
      />
      {uploading && <span className="muted">Загрузка…</span>}
      {preview && (
        <div className="admin-row">
          {accept === 'image' ? <img className="item-thumb" src={preview} alt="" /> : <audio controls src={preview} />}
          <button type="button" className="btn" onClick={clear}>Убрать</button>
        </div>
      )}
    </div>
  );
}
