import { request } from "./client";
import type {
  LessonSummary,
  LessonId,
  CompleteLessonRequest,
  CompleteLessonResponse,
} from "./types";

// ─── Lesson tree ──────────────────────────────────────────────────────────────

/**
 * Fetch the lesson tree for a wallet, with locked/unlocked/completed status.
 */
export async function fetchLessonTree(
  walletAddress: string,
): Promise<LessonSummary[]> {
  const res = await request<{ count: number; lessons: LessonSummary[] }>(
    `/api/lessons/tree/${walletAddress}`,
  );
  return res.lessons;
}

/**
 * Mark a lesson as completed for a wallet. Updates XP, streak, and the unlock
 * map for any actions gated behind the lesson.
 */
export async function completeLesson(
  walletAddress: string,
  lessonId: LessonId,
  unlockKey?: string,
): Promise<CompleteLessonResponse> {
  const body: CompleteLessonRequest = { walletAddress, lessonId, unlockKey };
  return request<CompleteLessonResponse>(
    `/api/lessons/${lessonId}/complete`,
    { body },
  );
}
