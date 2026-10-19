import { describe, expect, it } from 'vitest';
import { errorMessage } from '../src/admin/adminApi';

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
