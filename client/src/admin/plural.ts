/** Русское склонение по числу: forms = [1 раунд, 2 раунда, 5 раундов]. */
export function plural(n: number, forms: [string, string, string]): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}
