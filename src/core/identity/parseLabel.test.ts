import { describe, expect, it } from 'vitest';
import { displayCase, parseLabel } from './parseLabel';
import { parseNationalNumber } from './nationalNumber';

const today = new Date('2026-10-03T10:00:00');

/** Independent check-digit builder so tests do not reuse the code under test. */
function natnr(yymmdd: string, counter: string, born2000 = false): string {
  const nine = yymmdd + counter;
  const n = BigInt((born2000 ? '2' : '') + nine);
  const kk = 97 - Number(n % 97n);
  return nine + String(kk).padStart(2, '0');
}

describe('national number', () => {
  it('decodes a 20th-century number with birth date and sex', () => {
    const nr = natnr('850312', '284');
    const info = parseNationalNumber(`${nr.slice(0, 2)}.${nr.slice(2, 4)}.${nr.slice(4, 6)}-${nr.slice(6, 9)}.${nr.slice(9)}`);
    expect(info).toEqual({ digits: nr, dob: '1985-03-12', sex: 'F', bis: false });
  });
  it('decodes a 21st-century number', () => {
    expect(parseNationalNumber(natnr('050101', '123', true))?.dob).toBe('2005-01-01');
  });
  it('rejects a wrong check digit', () => {
    const nr = natnr('850312', '284');
    const bad = nr.slice(0, 9) + String((Number(nr.slice(9)) % 97) + 1).padStart(2, '0');
    expect(parseNationalNumber(bad)).toBeNull();
  });
  it('handles bis numbers (month + 40)', () => {
    const info = parseNationalNumber(natnr('854312', '001'));
    expect(info?.bis).toBe(true);
    expect(info?.dob).toBe('1985-03-12');
  });
});

describe('parseLabel', () => {
  it('reads a hospital sticker label with national number → high confidence', () => {
    const nr = natnr('850312', '284');
    const r = parseLabel({
      lines: ['UZ BRUSSEL', 'JANSSENS Marie', '°12/03/1985  V', 'Pat.nr: 2001234567', `INSZ ${nr.slice(0, 2)}.${nr.slice(2, 4)}.${nr.slice(4, 6)}-${nr.slice(6, 9)}.${nr.slice(9)}`],
      today,
    });
    expect(r).toMatchObject({
      surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12', patientNumber: '2001234567',
      nationalNumber: nr, sex: 'F', confidence: 'high', conflicts: [],
    });
  });

  it('reads "SURNAME, First" with a Geb. keyword', () => {
    const r = parseLabel({ lines: ['DE SMET, Vincent', 'Geb. 01.02.1990'], today });
    expect(r).toMatchObject({ surname: 'De Smet', firstName: 'Vincent', dob: '1990-02-01', nameSource: 'comma', confidence: 'high' });
  });

  it('reads an agenda screen with keywords and keeps mixed-case particles', () => {
    const r = parseLabel({
      lines: ['Naam: Van den Broeck Pieter-Jan', 'Geboortedatum: 1979-11-30', 'Dossier: 4455667', 'Afspraak 03/10/2026 14:30'],
      today,
    });
    expect(r).toMatchObject({ surname: 'Van den Broeck', firstName: 'Pieter-Jan', dob: '1979-11-30', patientNumber: '4455667' });
    // Keyword says it is a name, not which part is the surname → still asks.
    expect(r.confidence).toBe('medium');
    expect(r.warnings.join(' ')).toMatch(/Volgorde/);
  });

  it('reads separate surname / first-name fields as high confidence', () => {
    const r = parseLabel({ lines: ['Familienaam: PEETERS', 'Voornaam: an-sofie', 'Geboren: 4/7/1968'], today });
    expect(r).toMatchObject({ surname: 'Peeters', firstName: 'An-Sofie', dob: '1968-07-04', nameSource: 'split-keywords', confidence: 'high' });
  });

  it('reads French order "Mme Marie DUPONT" with née le', () => {
    const r = parseLabel({ lines: ['Mme Marie DUPONT', 'née le 05/06/1972'], today });
    expect(r).toMatchObject({ surname: 'Dupont', firstName: 'Marie', dob: '1972-06-05', confidence: 'high' });
  });

  it('keeps leading particles with the surname when all caps and warns about order', () => {
    const r = parseLabel({ lines: ['VAN DER ELST JAN', '07/08/1965'], today });
    expect(r).toMatchObject({ surname: 'Van der Elst', firstName: 'Jan', dob: '1965-08-07', nameSource: 'assumed-order', confidence: 'medium' });
  });

  it('handles handwritten-style lower case and a two-digit year', () => {
    const r = parseLabel({ lines: ['janssens marie', '12-3-85'], today });
    expect(r).toMatchObject({ surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12' });
    expect(r.warnings.join(' ')).toMatch(/twee cijfers/);
    expect(r.confidence).toBe('medium');
  });

  it('prefers the keyword date over an appointment date', () => {
    const r = parseLabel({ lines: ['PEETERS Jan', 'Consult 02/10/2026', '° 23/06/1950'], today });
    expect(r.dob).toBe('1950-06-23');
    expect(r.dobSource).toBe('keyword');
  });

  it('takes the earliest date when no keyword, with a warning', () => {
    const r = parseLabel({ lines: ['PEETERS Jan', '02/10/2026', '23/06/1950'], today });
    expect(r.dob).toBe('1950-06-23');
    expect(r.warnings.join(' ')).toMatch(/Meerdere datums/);
  });

  it('ignores future dates as birth dates', () => {
    const r = parseLabel({ lines: ['PEETERS Jan', 'OK 20/11/2026'], today });
    expect(r.dob).toBeUndefined();
    expect(r.confidence).toBe('low');
  });

  it('blocks when the national number disagrees with the read date', () => {
    const nr = natnr('850312', '284');
    const r = parseLabel({ lines: ['JANSSENS Marie', '° 13/03/1985', `RRN ${nr}`], today });
    expect(r.conflicts.length).toBe(1);
    expect(r.confidence).toBe('low');
  });

  it('blocks when the barcode disagrees with the printed patient number', () => {
    const r = parseLabel({ lines: ['JANSSENS Marie', '° 12/03/1985', 'Pat.nr: 2001234567'], barcodes: ['2001234568'], today });
    expect(r.conflicts[0]).toMatch(/Barcode/);
  });

  it('uses a numeric barcode as patient number when none is printed', () => {
    const r = parseLabel({ lines: ['JANSSENS Marie', '° 12/03/1985'], barcodes: ['2001234567'], today });
    expect(r.patientNumber).toBe('2001234567');
    expect(r.conflicts).toEqual([]);
  });

  it('does not mistake hospital, doctor or address lines for the patient', () => {
    const r = parseLabel({ lines: ['AZ DELTA', 'Dr. POELAERT Jeroen', 'Kerkstraat 12', 'MAES Els', '° 01/01/1980'], today });
    expect(r).toMatchObject({ surname: 'Maes', firstName: 'Els' });
  });

  it('returns low confidence with nothing usable', () => {
    const r = parseLabel({ lines: ['14:32', '###'], today });
    expect(r.confidence).toBe('low');
    expect(r.surname).toBeUndefined();
  });
});

describe('displayCase', () => {
  it.each([
    ['VAN DEN BROECK', 'Van den Broeck'],
    ["D'HONDT", "D'Hondt"],
    ['PIETER-JAN', 'Pieter-Jan'],
    ['Van den Broeck', 'Van den Broeck'],
    ['élise', 'Élise'],
  ])('%s → %s', (input, expected) => {
    expect(displayCase(input)).toBe(expected);
  });
});
