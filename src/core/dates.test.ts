import { describe, expect, it } from 'vitest';
import { formatDutchDate, parseDutchDate } from './dates';

const today = new Date('2026-10-03T10:00:00');

describe('dates', () => {
  it.each([
    ['12/03/1985', '1985-03-12'],
    ['12-3-1985', '1985-03-12'],
    ['12.03.85', '1985-03-12'],
    ['01 01 05', '2005-01-01'],
    ['12031985', '1985-03-12'],
    ['1985-03-12', '1985-03-12'],
  ])('%s → %s', (input, iso) => expect(parseDutchDate(input, today)).toBe(iso));
  it('rejects impossible dates and garbage', () => {
    expect(parseDutchDate('31/02/1985', today)).toBeNull();
    expect(parseDutchDate('abc', today)).toBeNull();
    expect(parseDutchDate('', today)).toBeNull();
  });
  it('formats ISO as dd/mm/jjjj', () => {
    expect(formatDutchDate('1985-03-12')).toBe('12/03/1985');
    expect(formatDutchDate(null)).toBe('');
  });
});
