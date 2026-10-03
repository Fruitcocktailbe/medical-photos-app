import { describe, expect, it } from 'vitest';
import { annotatedFileName, asciiSafe, episodeFolderName, nextShotIndex, patientFolderName, sessionFolderName, shotFileName } from './naming';

describe('naming', () => {
  it('makes patient folders ASCII-safe with DOB', () => {
    expect(patientFolderName({ surname: 'Van den Broeck', firstName: 'Pieter-Jan', dob: '1979-11-30' })).toBe('Van-den-Broeck_Pieter-Jan_1979-11-30');
    expect(patientFolderName({ surname: "D'Hondt", firstName: 'Élise', dob: '1990-01-01' })).toBe('DHondt_Elise_1990-01-01');
  });
  it('names episodes by region until the procedure is known', () => {
    expect(episodeFolderName({ startedAt: '2026-10-03', procedure: null, region: 'breast' })).toBe('2026-10_breast');
    expect(episodeFolderName({ startedAt: '2026-10-03', procedure: 'breast-augmentation', region: 'breast' })).toBe('2026-10_breast-augmentation');
  });
  it('names sessions and shots with the post-op interval', () => {
    const s = { date: '2026-11-14', visit: 'postop' as const, interval: '6w' };
    expect(sessionFolderName(s)).toBe('2026-11-14_postop-6w');
    expect(shotFileName(s, 'lateral-L', 3)).toBe('20261114_postop-6w_lateral-L_03.jpg');
    expect(sessionFolderName({ date: '2026-10-03', visit: 'preop' })).toBe('2026-10-03_preop');
  });
  it('counts shot indexes per view', () => {
    const shots = [{ view: 'AP', index: 1 }, { view: 'AP', index: 2 }, { view: 'lateral-L', index: 1 }] as never[];
    expect(nextShotIndex(shots, 'AP')).toBe(3);
    expect(nextShotIndex(shots, 'oblique-L')).toBe(1);
  });
  it('derives the annotated copy name', () => {
    expect(annotatedFileName('20261003_preop_AP_01.jpg')).toBe('20261003_preop_AP_01.annot.jpg');
  });
  it('asciiSafe collapses separators', () => {
    expect(asciiSafe('  a / b  ')).toBe('a-b');
  });
});
