import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_XP       = "homie_xp";
const KEY_STREAK   = "homie_streak";
const KEY_LAST_DAY = "homie_last_day";
const KEY_LESSONS  = "homie_lessons";

const LEVELS = [
  { min: 0,   label: "Curious" },
  { min: 100, label: "Learner" },
  { min: 350, label: "DeFi Native" },
  { min: 700, label: "Homie Pro" },
];

function xpToLevel(xp) {
  let level = LEVELS[0].label;
  for (const l of LEVELS) {
    if (xp >= l.min) level = l.label;
    else break;
  }
  return level;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export async function getProgress() {
  try {
    const [xpRaw, streakRaw, lessonsRaw] = await Promise.all([
      AsyncStorage.getItem(KEY_XP),
      AsyncStorage.getItem(KEY_STREAK),
      AsyncStorage.getItem(KEY_LESSONS),
    ]);
    const xp               = parseInt(xpRaw ?? "0") || 0;
    const streak           = parseInt(streakRaw ?? "0") || 0;
    const completedLessons = JSON.parse(lessonsRaw ?? "[]");
    return { xp, streak, level: xpToLevel(xp), completedLessons };
  } catch {
    return { xp: 0, streak: 0, level: "Curious", completedLessons: [] };
  }
}

export async function addXP(amount) {
  try {
    const current = parseInt((await AsyncStorage.getItem(KEY_XP)) ?? "0") || 0;
    await AsyncStorage.setItem(KEY_XP, String(current + amount));
    return current + amount;
  } catch {
    return 0;
  }
}

export async function markLessonDone(id) {
  try {
    const raw  = await AsyncStorage.getItem(KEY_LESSONS);
    const done = JSON.parse(raw ?? "[]");
    if (!done.includes(id)) {
      done.push(id);
      await AsyncStorage.setItem(KEY_LESSONS, JSON.stringify(done));
    }
    return done;
  } catch {
    return [];
  }
}

export async function recordStreak() {
  try {
    const today   = todayKey();
    const lastDay = await AsyncStorage.getItem(KEY_LAST_DAY);
    if (lastDay === today) return; // already counted today

    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })();

    const streak = parseInt((await AsyncStorage.getItem(KEY_STREAK)) ?? "0") || 0;
    const newStreak = lastDay === yesterday ? streak + 1 : 1;

    await Promise.all([
      AsyncStorage.setItem(KEY_STREAK, String(newStreak)),
      AsyncStorage.setItem(KEY_LAST_DAY, today),
    ]);
  } catch {}
}

export async function resetProgress() {
  await AsyncStorage.multiRemove([KEY_XP, KEY_STREAK, KEY_LAST_DAY, KEY_LESSONS]);
}
