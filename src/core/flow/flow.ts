/**
 * The app's navigation as a pure state machine (docs/ux-flow.md › Screen map).
 * Screens perform their side effects (archive calls), then dispatch the
 * result. Keeping this pure means every path and every Android back press is
 * unit-tested without a phone.
 */
import type { LabelParse } from '../identity/parseLabel';

interface Ctx {
  /** Onboarding test run: the summary offers to delete everything. */
  demo?: boolean;
}

export type Screen =
  | { name: 'onboarding'; step: 'folder' | 'lock' | 'ready' }
  | { name: 'scan' }
  | ({ name: 'confirm'; parse: LabelParse; photoUri?: string } & Ctx)
  | ({ name: 'treatment'; patientId: string } & Ctx)
  | ({ name: 'newTreatment'; patientId: string; hasEpisodes: boolean } & Ctx)
  | ({ name: 'visit'; patientId: string; episodeId: string } & Ctx)
  | ({ name: 'capture'; patientId: string; episodeId: string; sessionId: string } & Ctx)
  | ({ name: 'summary'; patientId: string; episodeId: string; sessionId: string } & Ctx)
  | { name: 'settings' }
  | { name: 'viewSets' }
  | { name: 'spikes' };

export type FlowEvent =
  | { type: 'ONBOARDING_NEXT' }
  | { type: 'ONBOARDING_DONE' }
  | { type: 'START_DEMO' }
  | { type: 'SCANNED'; parse: LabelParse; photoUri?: string }
  | { type: 'MANUAL_ENTRY' }
  | { type: 'PATIENT_CONFIRMED'; patientId: string; hasEpisodes: boolean }
  | { type: 'RECENT_PICKED'; patientId: string }
  | { type: 'NEW_TREATMENT' }
  | { type: 'EPISODE_CHOSEN'; episodeId: string }
  | { type: 'SESSION_STARTED'; sessionId: string }
  | { type: 'DONE_SHOOTING' }
  | { type: 'CONTINUE_SHOOTING' }
  | { type: 'SESSION_CLOSED' }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'OPEN_SPIKES' }
  | { type: 'OPEN_VIEW_SETS' }
  | { type: 'BACK' };

export const DEMO_PARSE: LabelParse = {
  surname: 'Demo',
  firstName: 'Proef',
  dob: '2000-01-01',
  confidence: 'high',
  warnings: ['Testpatiënt voor de proefrit. Fotografeer een voorwerp, geen persoon.'],
  conflicts: [],
};

const EMPTY_PARSE: LabelParse = { confidence: 'low', warnings: [], conflicts: [] };

export function initialScreen(onboarded: boolean): Screen {
  return onboarded ? { name: 'scan' } : { name: 'onboarding', step: 'folder' };
}

/** Screens where Android back leaves the app instead of navigating. */
export function isRoot(s: Screen): boolean {
  return s.name === 'scan' || s.name === 'onboarding';
}

export function reduce(s: Screen, e: FlowEvent): Screen {
  const demo = 'demo' in s ? s.demo : undefined;
  switch (e.type) {
    case 'ONBOARDING_NEXT':
      if (s.name !== 'onboarding') return s;
      return { name: 'onboarding', step: s.step === 'folder' ? 'lock' : 'ready' };
    case 'ONBOARDING_DONE':
      return s.name === 'onboarding' ? { name: 'scan' } : s;
    case 'START_DEMO':
      return s.name === 'onboarding' || s.name === 'settings' ? { name: 'confirm', parse: DEMO_PARSE, demo: true } : s;
    case 'SCANNED':
      return s.name === 'scan' ? { name: 'confirm', parse: e.parse, photoUri: e.photoUri } : s;
    case 'MANUAL_ENTRY':
      return s.name === 'scan' ? { name: 'confirm', parse: EMPTY_PARSE } : s;
    case 'PATIENT_CONFIRMED':
      if (s.name !== 'confirm') return s;
      return e.hasEpisodes
        ? { name: 'treatment', patientId: e.patientId, demo }
        : { name: 'newTreatment', patientId: e.patientId, hasEpisodes: false, demo };
    case 'RECENT_PICKED':
      return s.name === 'scan' ? { name: 'treatment', patientId: e.patientId } : s;
    case 'NEW_TREATMENT':
      return s.name === 'treatment' ? { name: 'newTreatment', patientId: s.patientId, hasEpisodes: true, demo } : s;
    case 'EPISODE_CHOSEN':
      return s.name === 'treatment' || s.name === 'newTreatment'
        ? { name: 'visit', patientId: s.patientId, episodeId: e.episodeId, demo }
        : s;
    case 'SESSION_STARTED':
      return s.name === 'visit'
        ? { name: 'capture', patientId: s.patientId, episodeId: s.episodeId, sessionId: e.sessionId, demo }
        : s;
    case 'DONE_SHOOTING':
      return s.name === 'capture' ? { ...s, name: 'summary' } : s;
    case 'CONTINUE_SHOOTING':
      return s.name === 'summary' ? { ...s, name: 'capture' } : s;
    case 'SESSION_CLOSED':
      return s.name === 'summary' ? { name: 'scan' } : s;
    case 'OPEN_SETTINGS':
      return s.name === 'scan' ? { name: 'settings' } : s;
    case 'OPEN_SPIKES':
      return s.name === 'settings' ? { name: 'spikes' } : s;
    case 'OPEN_VIEW_SETS':
      return s.name === 'settings' ? { name: 'viewSets' } : s;
    case 'BACK':
      return back(s);
  }
}

function back(s: Screen): Screen {
  switch (s.name) {
    case 'onboarding':
      if (s.step === 'lock') return { name: 'onboarding', step: 'folder' };
      if (s.step === 'ready') return { name: 'onboarding', step: 'lock' };
      return s;
    case 'scan':
      return s;
    case 'confirm':
    case 'treatment':
    case 'settings':
      return { name: 'scan' };
    case 'newTreatment':
      return s.hasEpisodes ? { name: 'treatment', patientId: s.patientId, demo: s.demo } : { name: 'scan' };
    case 'visit':
      return { name: 'treatment', patientId: s.patientId, demo: s.demo };
    case 'capture':
      // Photos are filed the moment they are taken; leaving means reviewing.
      return { ...s, name: 'summary' };
    case 'summary':
      return { ...s, name: 'capture' };
    case 'spikes':
    case 'viewSets':
      return { name: 'settings' };
  }
}
