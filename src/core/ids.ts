/** Short, sortable, collision-resistant ids. Injected in tests for determinism. */
export type IdGen = () => string;

export const defaultIdGen: IdGen = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** YYYY-MM-DD in local time. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
