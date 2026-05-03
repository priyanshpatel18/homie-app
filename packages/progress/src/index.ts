// ─── @homie/progress ─────────────────────────────────────────────────────────
// XP, streak, and lesson-completion tracking with a pluggable storage adapter.

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  multiRemove?(keys: string[]): Promise<void>;
}

export interface LevelTier {
  min: number;
  label: string;
}

export interface ProgressSnapshot {
  xp: number;
  streak: number;
  level: string;
  completedLessons: string[];
}

const KEY_XP = "homie_xp";
const KEY_STREAK = "homie_streak";
const KEY_LAST_DAY = "homie_last_day";
const KEY_LESSONS = "homie_lessons";

const LEVELS: LevelTier[] = [
  { min: 0, label: "Curious" },
  { min: 100, label: "Learner" },
  { min: 350, label: "DeFi Native" },
  { min: 700, label: "Homie Pro" },
];

let _storage: StorageAdapter | null = null;

export function configureProgressStorage(adapter: StorageAdapter): void {
  _storage = adapter;
}

function getStorage(): StorageAdapter {
  if (!_storage) {
    throw new Error(
      "[@homie/progress] Storage not configured. Call configureProgressStorage() at app boot.",
    );
  }
  return _storage;
}

function xpToLevel(xp: number): string {
  let level = LEVELS[0]!.label;
  for (const l of LEVELS) {
    if (xp >= l.min) level = l.label;
    else break;
  }
  return level;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export async function getProgress(): Promise<ProgressSnapshot> {
  try {
    const storage = getStorage();
    const [xpRaw, streakRaw, lessonsRaw] = await Promise.all([
      storage.getItem(KEY_XP),
      storage.getItem(KEY_STREAK),
      storage.getItem(KEY_LESSONS),
    ]);
    const xp = parseInt(xpRaw ?? "0") || 0;
    const streak = parseInt(streakRaw ?? "0") || 0;
    const completedLessons = JSON.parse(lessonsRaw ?? "[]") as string[];
    return { xp, streak, level: xpToLevel(xp), completedLessons };
  } catch {
    return { xp: 0, streak: 0, level: "Curious", completedLessons: [] };
  }
}

export async function addXP(amount: number): Promise<number> {
  try {
    const storage = getStorage();
    const current = parseInt((await storage.getItem(KEY_XP)) ?? "0") || 0;
    const next = current + amount;
    await storage.setItem(KEY_XP, String(next));
    return next;
  } catch {
    return 0;
  }
}

export async function markLessonDone(id: string): Promise<string[]> {
  try {
    const storage = getStorage();
    const raw = await storage.getItem(KEY_LESSONS);
    const done = JSON.parse(raw ?? "[]") as string[];
    if (!done.includes(id)) {
      done.push(id);
      await storage.setItem(KEY_LESSONS, JSON.stringify(done));
    }
    return done;
  } catch {
    return [];
  }
}

export async function recordStreak(): Promise<void> {
  try {
    const storage = getStorage();
    const today = todayKey();
    const lastDay = await storage.getItem(KEY_LAST_DAY);
    if (lastDay === today) return;

    const yesterday = yesterdayKey();
    const streak = parseInt((await storage.getItem(KEY_STREAK)) ?? "0") || 0;
    const newStreak = lastDay === yesterday ? streak + 1 : 1;

    await Promise.all([
      storage.setItem(KEY_STREAK, String(newStreak)),
      storage.setItem(KEY_LAST_DAY, today),
    ]);
  } catch {
    // swallow
  }
}

export async function resetProgress(): Promise<void> {
  const storage = getStorage();
  const keys = [KEY_XP, KEY_STREAK, KEY_LAST_DAY, KEY_LESSONS];
  if (storage.multiRemove) {
    await storage.multiRemove(keys);
  } else {
    await Promise.all(keys.map((k) => storage.removeItem(k)));
  }
}
