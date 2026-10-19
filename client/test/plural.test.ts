import { describe, expect, it } from 'vitest';
import { plural } from '../src/admin/plural';

const ROUND: [string, string, string] = ['раунд', 'раунда', 'раундов'];

describe('plural', () => {
  it.each([
    [0, 'раундов'], [1, 'раунд'], [2, 'раунда'], [4, 'раунда'], [5, 'раундов'],
    [11, 'раундов'], [12, 'раундов'], [14, 'раундов'], [21, 'раунд'], [22, 'раунда'],
    [25, 'раундов'], [101, 'раунд'], [111, 'раундов'], [112, 'раундов'],
  ])('%i → %s', (n, form) => {
    expect(plural(n, ROUND)).toBe(form);
  });

  it('темы и вопросы', () => {
    const THEME: [string, string, string] = ['тема', 'темы', 'тем'];
    const QUESTION: [string, string, string] = ['вопрос', 'вопроса', 'вопросов'];
    expect([1, 3, 5, 21].map((n) => plural(n, THEME))).toEqual(['тема', 'темы', 'тем', 'тема']);
    expect([1, 2, 11, 22].map((n) => plural(n, QUESTION))).toEqual(['вопрос', 'вопроса', 'вопросов', 'вопроса']);
  });
});
