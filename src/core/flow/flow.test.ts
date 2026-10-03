import { describe, expect, it } from 'vitest';
import { DEMO_PARSE, initialScreen, isRoot, reduce, type FlowEvent, type Screen } from './flow';

const parse = { surname: 'Janssens', firstName: 'Marie', dob: '1985-03-12', confidence: 'high' as const, warnings: [], conflicts: [] };
const run = (start: Screen, events: FlowEvent[]) => events.reduce(reduce, start);

describe('flow', () => {
  it('first launch goes through onboarding to the scan camera', () => {
    const s = run(initialScreen(false), [{ type: 'ONBOARDING_NEXT' }, { type: 'ONBOARDING_NEXT' }, { type: 'ONBOARDING_DONE' }]);
    expect(s).toEqual({ name: 'scan' });
    expect(initialScreen(true)).toEqual({ name: 'scan' });
  });

  it('new patient: scan → confirm → new treatment → visit → capture → summary → scan', () => {
    const steps: FlowEvent[] = [
      { type: 'SCANNED', parse, photoUri: 'file:///cache/label.jpg' },
      { type: 'PATIENT_CONFIRMED', patientId: 'p1', hasEpisodes: false },
      { type: 'EPISODE_CHOSEN', episodeId: 'e1' },
      { type: 'SESSION_STARTED', sessionId: 's1' },
      { type: 'DONE_SHOOTING' },
    ];
    const names: string[] = [];
    steps.reduce((s, e) => {
      const n = reduce(s, e);
      names.push(n.name);
      return n;
    }, initialScreen(true));
    expect(names).toEqual(['confirm', 'newTreatment', 'visit', 'capture', 'summary']);
    const end = run(initialScreen(true), [...steps, { type: 'SESSION_CLOSED' }]);
    expect(end).toEqual({ name: 'scan' });
  });

  it('returning patient lands on the treatment list; recent skips the scan', () => {
    expect(run({ name: 'scan' }, [{ type: 'SCANNED', parse }, { type: 'PATIENT_CONFIRMED', patientId: 'p1', hasEpisodes: true }]))
      .toEqual({ name: 'treatment', patientId: 'p1', demo: undefined });
    expect(reduce({ name: 'scan' }, { type: 'RECENT_PICKED', patientId: 'p1' })).toEqual({ name: 'treatment', patientId: 'p1' });
  });

  it('Android back follows the spec', () => {
    const cap: Screen = { name: 'capture', patientId: 'p', episodeId: 'e', sessionId: 's' };
    expect(reduce(cap, { type: 'BACK' }).name).toBe('summary');
    expect(reduce({ ...cap, name: 'summary' }, { type: 'BACK' }).name).toBe('capture');
    expect(reduce({ name: 'visit', patientId: 'p', episodeId: 'e' }, { type: 'BACK' })).toEqual({ name: 'treatment', patientId: 'p', demo: undefined });
    expect(reduce({ name: 'newTreatment', patientId: 'p', hasEpisodes: false }, { type: 'BACK' })).toEqual({ name: 'scan' });
    expect(reduce({ name: 'newTreatment', patientId: 'p', hasEpisodes: true }, { type: 'BACK' }).name).toBe('treatment');
    expect(reduce({ name: 'confirm', parse }, { type: 'BACK' })).toEqual({ name: 'scan' });
    expect(reduce({ name: 'spikes' }, { type: 'BACK' })).toEqual({ name: 'settings' });
    expect(isRoot({ name: 'scan' })).toBe(true);
    expect(isRoot(cap)).toBe(false);
  });

  it('the demo flag travels through the whole test run', () => {
    const s = run({ name: 'onboarding', step: 'ready' }, [
      { type: 'START_DEMO' },
      { type: 'PATIENT_CONFIRMED', patientId: 'demo', hasEpisodes: false },
      { type: 'EPISODE_CHOSEN', episodeId: 'e' },
      { type: 'SESSION_STARTED', sessionId: 's' },
      { type: 'DONE_SHOOTING' },
    ]);
    expect(s).toMatchObject({ name: 'summary', demo: true });
    expect(reduce({ name: 'onboarding', step: 'ready' }, { type: 'START_DEMO' })).toMatchObject({ parse: DEMO_PARSE });
  });

  it('ignores events that do not belong to the current screen', () => {
    const scan: Screen = { name: 'scan' };
    expect(reduce(scan, { type: 'DONE_SHOOTING' })).toBe(scan);
    expect(reduce(scan, { type: 'SESSION_STARTED', sessionId: 's' })).toBe(scan);
  });
});
