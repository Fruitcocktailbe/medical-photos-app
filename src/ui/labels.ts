import { areasLabel, procedureById, stepForKey, type ViewSetOverrides } from '../core/catalog/catalog';
import type { Episode, Patient } from '../core/types';
import { formatDutchDate } from '../core/dates';

export const procedureLabel = (id: string | null) => (id ? procedureById(id)?.label ?? id : null);

/** Card title: the procedure once known, else the treated areas. */
export const treatmentTitle = (e: Episode) => procedureLabel(e.procedure) ?? `${areasLabel(e.areas)} — nog geen ingreep`;

/** "Borsten + Buik", "Dij links", "Litteken · linker onderarm, voorzijde". */
export const treatmentAreas = (e: Episode) => areasLabel(e.areas);

export const viewLabel = (key: string, overrides?: ViewSetOverrides) => stepForKey(key, overrides).label;

export const fullName = (p: Patient) => `${p.surname.toUpperCase()} ${p.firstName}`;

/** Capture banner: initial only, the patient may see the screen. */
export const shortName = (p: Patient) => `${p.surname.toUpperCase()} ${p.firstName.charAt(0)}.`;

export const born = (p: Patient) => `° ${formatDutchDate(p.dob)}`;
