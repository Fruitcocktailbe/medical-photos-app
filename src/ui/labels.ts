import { REGION_LABELS, VIEWS, procedureById } from '../core/catalog/catalog';
import type { Episode, Patient } from '../core/types';
import { formatDutchDate } from '../core/dates';

export const procedureLabel = (id: string | null) => (id ? procedureById(id)?.label ?? id : null);

export const treatmentTitle = (e: Episode) => procedureLabel(e.procedure) ?? `${REGION_LABELS[e.region]} — nog geen ingreep`;

export const viewLabel = (id: string) => VIEWS[id]?.label ?? id;

export const fullName = (p: Patient) => `${p.surname.toUpperCase()} ${p.firstName}`;

/** Capture banner: initial only, the patient may see the screen. */
export const shortName = (p: Patient) => `${p.surname.toUpperCase()} ${p.firstName.charAt(0)}.`;

export const born = (p: Patient) => `° ${formatDutchDate(p.dob)}`;
