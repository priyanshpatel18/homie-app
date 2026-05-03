// ─── Lesson step types ───────────────────────────────────────────────────────

export interface SplashStep {
  type: "splash";
  emoji: string;
  title: string;
  subtitle: string;
}

export interface ComparisonStep {
  type: "comparison";
  title: string;
  leftEmoji: string;
  leftLabel: string;
  leftPoints: string[];
  rightEmoji: string;
  rightLabel: string;
  rightPoints: string[];
}

export interface YourNumbersStep {
  type: "your_numbers";
  title: string;
  desc: string;
  dataKey: string;
  unit: string;
  tip?: string;
}

export interface ApyChartBar {
  label: string;
  multiplier?: number;
  apy?: number;
  color: string;
}

export interface ApyChartStep {
  type: "apy_chart";
  title: string;
  desc: string;
  bars: ApyChartBar[];
  baseLabel: string;
  isLiveApy?: boolean;
}

export interface QuizOption {
  text: string;
  correct: boolean;
}

export interface QuizStep {
  type: "quiz";
  question: string;
  options: QuizOption[];
  explanation: string;
}

export interface CtaStep {
  type: "cta";
  emoji: string;
  title: string;
  desc: string;
  actionLabel: string;
  nextLessonId: string | null;
  actionType?: string;
}

export type LessonStep =
  | SplashStep
  | ComparisonStep
  | YourNumbersStep
  | ApyChartStep
  | QuizStep
  | CtaStep;

export interface Lesson {
  id: string;
  title: string;
  emoji: string;
  xp: number;
  steps: LessonStep[];
}

export type LessonId = string;
export type LessonCatalog = Record<LessonId, Lesson>;

// ─── Token explainer types ───────────────────────────────────────────────────

export interface TokenExplainer {
  emoji: string;
  name: string | null;
  tagline: string;
  what: string;
  how: string;
  action: string;
  color: string;
  isStaking: boolean;
  relatedLessonId: string | null;
  relatedLessonLabel: string | null;
  rateKey: string | null;
}

export type TokenExplainerMap = Record<string, TokenExplainer>;
