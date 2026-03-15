export interface PhaseConfig {
  name: string;
  key: string;
  default_opens: string;  // ISO date
  default_closes: string; // ISO date
}

export const PHASE_DEFINITIONS: PhaseConfig[] = [
  { name: 'Registration', key: 'registration', default_opens: '2026-05-01', default_closes: '2026-07-10' },
  { name: 'CFP Submissions', key: 'cfp', default_opens: '2026-05-01', default_closes: '2026-06-15' },
  { name: 'Booth Setup', key: 'booth_setup', default_opens: '2026-05-01', default_closes: '2026-07-01' },
  { name: 'Voting', key: 'voting', default_opens: '2026-06-15', default_closes: '2026-06-20' },
  { name: 'Talk Uploads', key: 'talk_uploads', default_opens: '2026-06-20', default_closes: '2026-07-03' },
  { name: 'Show Floor', key: 'show_floor', default_opens: '2026-07-07', default_closes: '2026-07-10' },
  { name: 'Matchmaking', key: 'matchmaking', default_opens: '2026-07-08', default_closes: '2026-07-10' },
  { name: 'Manifesto', key: 'manifesto', default_opens: '2026-07-07', default_closes: '2026-07-10' },
  { name: 'Yearbook', key: 'yearbook', default_opens: '2026-07-08', default_closes: '2026-07-15' },
];

export function isPhaseOpen(phase: PhaseConfig, overrides?: { is_open?: boolean; opens?: string; closes?: string }, now?: Date): boolean {
  const current = now || new Date();
  const opens = new Date(overrides?.opens || phase.default_opens);
  const closes = new Date(overrides?.closes || phase.default_closes);
  closes.setHours(23, 59, 59, 999); // Close at end of day

  if (overrides?.is_open !== undefined) return overrides.is_open;
  return current >= opens && current <= closes;
}
