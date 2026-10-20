export const GUIDED_REVISION_TEMPLATE_VERSION = 'guided-image-revision/1.0.0' as const;
export const MAX_GUIDANCE_LENGTH = 2000;

/** Trusted, server-resolved context for one selected image version. */
export interface GuidedRevisionContext {
  sourceId: string;
  sourceVersionId: string;
  operationId: string;
  sourceImagePrompt: string;
  planSnapshot: unknown | null;
  lockedFacts: unknown[];
  referenceManifest: unknown[];
  renderingContract: unknown;
  sourceEditHistory?: string[];
}

export type GuidedRevisionResult<TPlan = unknown> =
  | { status: 'ok'; updatedPlan: TPlan | null; revisedImagePrompt: string; summary: string[] }
  | { status: 'blocked'; reason: string };

export type GuidedSubmissionState = 'not_submitted' | 'submitted' | 'unknown';
export type GuidedFailureStage = 'context' | 'rewrite' | 'validate' | 'generate' | 'store' | 'unknown';

export interface GuidedRegenerationInput {
  sourceId: string;
  sourceVersionId: string;
  operationId: string;
  guidance: string;
}

export interface GuidedImageCandidate<TPlan = unknown> {
  sourceId: string;
  sourceVersionId: string;
  operationId: string;
  userGuidance: string;
  generationPrompt: string;
  operationPromptUsed: string;
  planSnapshot: TPlan | null;
  summary: string[];
  submissionState: GuidedSubmissionState;
  generatedResult?: unknown;
}

export interface GuidedRegenerationFailure {
  code: string;
  stage: GuidedFailureStage;
  safeMessage: string;
  retryable: boolean;
  submissionState: GuidedSubmissionState;
}
