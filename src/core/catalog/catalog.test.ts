import { describe, expect, it } from 'vitest';
import { PROCEDURES, REGION_VIEWS, VIEWS, procedurePickerOrder, viewSet } from './catalog';

describe('catalog', () => {
  it('every referenced view exists', () => {
    for (const ids of Object.values(REGION_VIEWS)) for (const id of ids) expect(VIEWS[id]).toBeDefined();
    for (const p of PROCEDURES) for (const id of [...(p.views ?? []), ...(p.extraViews ?? [])]) expect(VIEWS[id]).toBeDefined();
  });
  it('procedure ids are unique', () => {
    expect(new Set(PROCEDURES.map((p) => p.id)).size).toBe(PROCEDURES.length);
  });
  it('pre-op needs only the region to know the views', () => {
    expect(viewSet('breast', null)).toEqual(REGION_VIEWS.breast);
  });
  it('a procedure can extend its region set (rhinoplasty adds basal)', () => {
    expect(viewSet('face', 'rhinoplasty')).toEqual([...REGION_VIEWS.face, 'basal']);
  });
  it('left views have positive yaw, right views negative', () => {
    expect(VIEWS['lateral-L'].yaw).toBe(90);
    expect(VIEWS['oblique-R'].yaw).toBe(-45);
  });
  it('orders the picker: favourites, then region, then the rest', () => {
    const order = procedurePickerOrder('breast', ['facelift']).map((p) => p.id);
    expect(order[0]).toBe('facelift');
    expect(order[1]).toBe('breast-augmentation');
    expect(order).toHaveLength(PROCEDURES.length);
  });
});
