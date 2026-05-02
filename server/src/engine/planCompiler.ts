/**
 * Plan compiler — assembles already-built transaction tool results
 * into a multi-step bundle that the frontend's BundlePreview can walk through.
 *
 * The compiler does NOT build transactions. It receives serialized txs from
 * upstream tool calls and packages them with narration + rollback context.
 */

export type NarrativeLevel = "full" | "brief" | "silent";

export interface PlanStepInput {
  label: string;
  protocol: string;
  serializedTx: string;
  estimatedOutput?: string;
  plainEnglish?: string;   // one sentence, exact numbers, no jargon
  riskLevel?: "low" | "medium" | "high";
  amountUsd?: number;
}

export interface PlanStep {
  step: number;
  label: string;
  protocol: string;
  serializedTx: string;
  estimatedOutput: string;
  description: string;     // shown in BundlePreview step row
  plainEnglish?: string;   // shown only when narrativeLevel permits
  riskLevel: "low" | "medium" | "high";
  amountUsd: number;
}

export interface CompiledPlan {
  type: "transaction_bundle";
  title: string;
  why?: string;
  totalSteps: number;
  steps: PlanStep[];
  rollbackInstructions: string[];
  estimatedTotalUsd: number;
  narrativeLevel: NarrativeLevel;
  estimatedGas?: string;
  requiresApproval: true;
}

function rollbackForStep(stepIndex: number, steps: PlanStepInput[]): string {
  if (stepIndex === 0) {
    return "If step 1 fails, nothing has changed — your wallet is untouched.";
  }
  const prev = steps[stepIndex - 1];
  return `If step ${stepIndex + 1} fails, your wallet holds the output from step ${stepIndex} (${prev.estimatedOutput ?? "previous step output"}). No further action needed.`;
}

export function compilePlan(params: {
  steps: PlanStepInput[];
  title: string;
  why?: string;
  narrativeLevel: NarrativeLevel;
  estimatedGas?: string;
}): CompiledPlan {
  const { steps, title, why, narrativeLevel, estimatedGas } = params;

  const compiledSteps: PlanStep[] = steps.map((s, i) => ({
    step: i + 1,
    label: s.label,
    protocol: s.protocol,
    serializedTx: s.serializedTx,
    estimatedOutput: s.estimatedOutput ?? "",
    description: s.estimatedOutput ? `→ ${s.estimatedOutput}` : s.label,
    plainEnglish: s.plainEnglish,
    riskLevel: s.riskLevel ?? "low",
    amountUsd: s.amountUsd ?? 0,
  }));

  const estimatedTotalUsd = steps.reduce((sum, s) => sum + (s.amountUsd ?? 0), 0);

  const rollbackInstructions = steps.map((_, i) => rollbackForStep(i, steps));

  return {
    type: "transaction_bundle",
    title,
    why,
    totalSteps: compiledSteps.length,
    steps: compiledSteps,
    rollbackInstructions,
    estimatedTotalUsd: parseFloat(estimatedTotalUsd.toFixed(2)),
    narrativeLevel,
    estimatedGas,
    requiresApproval: true,
  };
}
