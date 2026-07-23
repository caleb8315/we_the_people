/**
 * People-first progress system.
 *
 * Client-first XP / streaks / daily missions with optional server sync later.
 * Designed to feel like a civic game — not a dark-pattern engagement trap.
 */

export type MissionId = 'verify_claim' | 'scout_signals' | 'check_dispute';

export type XpAction =
  | 'verify_claim'
  | 'open_signal'
  | 'open_dispute'
  | 'read_briefing'
  | 'complete_onboarding';

export interface Rank {
  id: string;
  title: string;
  minXp: number;
  blurb: string;
}

export interface MissionDef {
  id: MissionId;
  title: string;
  detail: string;
  target: number;
  xp: number;
  href: string;
}

export interface PlayerProgress {
  xp: number;
  streak: number;
  lastActiveDay: string | null;
  missionDay: string;
  missions: Record<MissionId, number>;
  completedMissions: MissionId[];
  unlockedBadges: string[];
}

const STORAGE_KEY = 'crosscheck.player.v1';

export const RANKS: Rank[] = [
  { id: 'newcomer', title: 'Newcomer', minXp: 0, blurb: 'Just arrived. Start checking.' },
  { id: 'citizen', title: 'Citizen', minXp: 50, blurb: 'You are in the game.' },
  { id: 'watchdog', title: 'Watchdog', minXp: 150, blurb: 'You catch what others scroll past.' },
  { id: 'hunter', title: 'Truth Hunter', minXp: 350, blurb: 'Claims do not get a free pass.' },
  { id: 'sentinel', title: 'Sentinel', minXp: 700, blurb: 'The feed listens when you talk.' },
  { id: 'guardian', title: 'Guardian', minXp: 1200, blurb: 'Built for the people.' },
];

export const DAILY_MISSIONS: MissionDef[] = [
  {
    id: 'verify_claim',
    title: 'Verify a claim',
    detail: 'Paste a headline, link, or rumor and get a clear call.',
    target: 1,
    xp: 40,
    href: '/verify',
  },
  {
    id: 'scout_signals',
    title: 'Scout 3 stories',
    detail: 'Open three signals and see what actually holds up.',
    target: 3,
    xp: 30,
    href: '/feed',
  },
  {
    id: 'check_dispute',
    title: 'Inspect a clash',
    detail: 'Open a story where sources disagree and compare both sides.',
    target: 1,
    xp: 35,
    href: '/feed?corroboration=all',
  },
];

export const XP_REWARDS: Record<XpAction, number> = {
  verify_claim: 25,
  open_signal: 5,
  open_dispute: 12,
  read_briefing: 15,
  complete_onboarding: 40,
};

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function emptyProgress(day = todayKey()): PlayerProgress {
  return {
    xp: 0,
    streak: 0,
    lastActiveDay: null,
    missionDay: day,
    missions: { verify_claim: 0, scout_signals: 0, check_dispute: 0 },
    completedMissions: [],
    unlockedBadges: [],
  };
}

export function rankForXp(xp: number): Rank {
  let current = RANKS[0]!;
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
  }
  return current;
}

export function nextRank(xp: number): Rank | null {
  const current = rankForXp(xp);
  const idx = RANKS.findIndex((r) => r.id === current.id);
  return RANKS[idx + 1] ?? null;
}

export function rankProgress(xp: number): { current: Rank; next: Rank | null; pct: number } {
  const current = rankForXp(xp);
  const next = nextRank(xp);
  if (!next) return { current, next: null, pct: 100 };
  const span = next.minXp - current.minXp;
  const gained = xp - current.minXp;
  const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((gained / span) * 100)));
  return { current, next, pct };
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.round(ms / (24 * 3600 * 1000));
}

function rollDay(progress: PlayerProgress, day = todayKey()): PlayerProgress {
  if (progress.missionDay === day) return progress;
  return {
    ...progress,
    missionDay: day,
    missions: { verify_claim: 0, scout_signals: 0, check_dispute: 0 },
    completedMissions: [],
  };
}

function touchStreak(progress: PlayerProgress, day = todayKey()): PlayerProgress {
  if (progress.lastActiveDay === day) return progress;
  if (!progress.lastActiveDay) {
    return { ...progress, streak: 1, lastActiveDay: day };
  }
  const gap = daysBetween(progress.lastActiveDay, day);
  if (gap === 1) {
    return { ...progress, streak: progress.streak + 1, lastActiveDay: day };
  }
  return { ...progress, streak: 1, lastActiveDay: day };
}

function awardMissionProgress(
  progress: PlayerProgress,
  missionId: MissionId,
  amount: number,
): PlayerProgress {
  const def = DAILY_MISSIONS.find((m) => m.id === missionId);
  if (!def) return progress;
  if (progress.completedMissions.includes(missionId)) return progress;

  const nextCount = Math.min(def.target, (progress.missions[missionId] ?? 0) + amount);
  const missions = { ...progress.missions, [missionId]: nextCount };
  let xp = progress.xp;
  const completedMissions = [...progress.completedMissions];
  const unlockedBadges = [...progress.unlockedBadges];

  if (nextCount >= def.target && !completedMissions.includes(missionId)) {
    completedMissions.push(missionId);
    xp += def.xp;
    if (completedMissions.length === DAILY_MISSIONS.length && !unlockedBadges.includes('daily_clean')) {
      unlockedBadges.push('daily_clean');
      xp += 25;
    }
  }

  return { ...progress, missions, completedMissions, unlockedBadges, xp };
}

export function loadProgress(): PlayerProgress {
  if (typeof window === 'undefined') return emptyProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<PlayerProgress>;
    const base = { ...emptyProgress(), ...parsed };
    base.missions = {
      verify_claim: Number(base.missions?.verify_claim ?? 0),
      scout_signals: Number(base.missions?.scout_signals ?? 0),
      check_dispute: Number(base.missions?.check_dispute ?? 0),
    };
    return rollDay(base);
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress: PlayerProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    window.dispatchEvent(new CustomEvent('crosscheck:progress', { detail: progress }));
  } catch {
    // ignore quota / private mode
  }
}

export function applyXpAction(action: XpAction, opts?: { disputed?: boolean }): PlayerProgress {
  let progress = touchStreak(rollDay(loadProgress()));
  const reward = XP_REWARDS[action] ?? 0;
  progress = { ...progress, xp: progress.xp + reward };

  if (action === 'verify_claim') {
    progress = awardMissionProgress(progress, 'verify_claim', 1);
  } else if (action === 'open_signal') {
    progress = awardMissionProgress(progress, 'scout_signals', 1);
    if (opts?.disputed) {
      progress = awardMissionProgress(progress, 'check_dispute', 1);
    }
  } else if (action === 'open_dispute') {
    progress = awardMissionProgress(progress, 'check_dispute', 1);
  }

  if (progress.streak >= 3 && !progress.unlockedBadges.includes('streak_3')) {
    progress = {
      ...progress,
      unlockedBadges: [...progress.unlockedBadges, 'streak_3'],
      xp: progress.xp + 20,
    };
  }

  saveProgress(progress);
  return progress;
}

export function missionStatus(progress: PlayerProgress, mission: MissionDef) {
  const count = progress.missions[mission.id] ?? 0;
  const done = progress.completedMissions.includes(mission.id) || count >= mission.target;
  return { count, done, pct: Math.min(100, Math.round((count / mission.target) * 100)) };
}
