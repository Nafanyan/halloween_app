import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorMessage, uploadErrorMessage, uploadMedia } from '../src/admin/adminApi';

describe('errorMessage', () => {
  it('maps known codes', () => {
    expect(errorMessage('UNAUTHORIZED')).toBe('Нет доступа');
    expect(errorMessage('INVALID_POINTS')).toBe('Нужно целое число');
    expect(errorMessage('NO_ANSWERER')).toBe('Никто не отвечает');
  });
  it('falls back to generic', () => expect(errorMessage('NAME_TAKEN')).toBe('Ошибка'));
});

describe('shop errors', () => {
  it('maps shop errors', () => {
    expect(errorMessage('INVALID_ITEM')).toBe('Проверьте поля предмета');
    expect(errorMessage('SOLD_OUT')).toBe('Предмет распродан');
    expect(errorMessage('NOT_ENOUGH_POINTS')).toBe('Не хватает очков');
  });
});

describe('library errors', () => {
  it('maps library errors', () => {
    expect(errorMessage('GAME_ACTIVE')).toBe('Нельзя удалить активную игру');
    expect(errorMessage('NO_QUESTIONS')).toBe('В игре нет вопросов');
    expect(errorMessage('INVALID_SETTINGS')).toBe('Проверьте поля настроек');
  });
});

describe('uploadErrorMessage', () => {
  it('maps statuses', () => {
    expect(uploadErrorMessage(413)).toBe('Файл слишком большой');
    expect(uploadErrorMessage(415)).toBe('Этот формат не подходит');
    expect(uploadErrorMessage(401)).toBe('Нет доступа');
    expect(uploadErrorMessage(500)).toBe('Не удалось загрузить файл');
    expect(uploadErrorMessage(undefined)).toBe('Не удалось загрузить файл');
  });
});

describe('uploadMedia', () => {
  const stubPin = (pin: string) => vi.stubGlobal('sessionStorage', { getItem: () => pin, setItem: () => {}, removeItem: () => {} });
  afterEach(() => vi.unstubAllGlobals());

  it('posts the blob with the admin pin and returns file+url', async () => {
    stubPin('1234');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ file: 'a.jpg', url: '/media/g/a.jpg' }) });
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await expect(uploadMedia('g-aaaaaaaa', blob)).resolves.toEqual({ file: 'a.jpg', url: '/media/g/a.jpg' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/games/g-aaaaaaaa/media');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Admin-Pin']).toBe('1234');
    expect(init.body).toBe(blob);
  });

  it('throws with status on 413', async () => {
    stubPin('1234');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413 }));
    await expect(uploadMedia('g-aaaaaaaa', new Blob(['x']))).rejects.toMatchObject({ status: 413 });
  });
});
