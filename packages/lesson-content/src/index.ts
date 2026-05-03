// ─── @homie/lesson-content ───────────────────────────────────────────────────
// Pure data: lesson catalog, ordering, and per-token plain-English explainers.

export { LESSONS, LESSON_IDS_ORDERED, getLesson } from "./catalog";

export {
  TOKEN_EXPLAINERS,
  UNKNOWN_EXPLAINER,
  getExplainer,
  MSOL_MINT,
  JITOSOL_MINT,
  INF_MINT,
  BSOL_MINT,
  USDC_MINT,
  USDT_MINT,
} from "./token-explainers";

export type {
  Lesson,
  LessonId,
  LessonCatalog,
  LessonStep,
  SplashStep,
  ComparisonStep,
  YourNumbersStep,
  ApyChartStep,
  ApyChartBar,
  QuizStep,
  QuizOption,
  CtaStep,
  TokenExplainer,
  TokenExplainerMap,
} from "./types";
