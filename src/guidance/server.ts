import { buildGuidedRevisionPrompt } from './prompt.js';
import { parseGuidedRevisionResult, validateGuidedRevisionInput } from './validation.js';
import type {
  GuidedFailureStage,
  GuidedImageCandidate,
  GuidedRegenerationFailure,
  GuidedRegenerationInput,
  GuidedRevisionContext,
  GuidedSubmissionState,
} from './types.js';

export class GuidedRegenerationFailureError extends Error {
  readonly failure: GuidedRegenerationFailure;

  constructor(failure: GuidedRegenerationFailure) {
    super(failure.safeMessage);
    this.name = 'GuidedRegenerationFailureError';
    this.failure = failure;
  }
}

export interface GuidedRegenerationDependencies<TContext extends GuidedRevisionContext, TPlan, TResult> {
  loadContext(input: Pick<GuidedRegenerationInput, 'sourceId' | 'sourceVersionId' | 'operationId'>, principal: unknown): Promise<TContext>;
  rewrite(prompt: string): Promise<unknown>;
  validatePlanRevision(context: TContext, plan: unknown): Promise<TPlan | null>;
  generateImage(input: { prompt: string; context: TContext; operationId: string; principal: unknown }): Promise<TResult>;
  savePending(candidate: GuidedImageCandidate<TPlan>, principal: unknown): Promise<void>;
  loadPending(operationId: string, principal: unknown): Promise<GuidedImageCandidate<TPlan> | undefined>;
  clearPending(operationId: string, principal: unknown): Promise<void>;
  appendVersion(result: TResult, candidate: GuidedImageCandidate<TPlan>, principal: unknown): Promise<void>;
}

function failure(
  error: unknown,
  stage: GuidedFailureStage,
  safeMessage: string,
  submissionState: GuidedSubmissionState = 'not_submitted',
): GuidedRegenerationFailureError {
  if (error instanceof GuidedRegenerationFailureError) return error;
  return new GuidedRegenerationFailureError({
    code: `${stage}_failed`, stage, safeMessage,
    retryable: stage === 'generate' && submissionState === 'not_submitted',
    submissionState,
  });
}

function assertIdentity(input: GuidedRegenerationInput, context: GuidedRevisionContext): void {
  if (input.sourceId !== context.sourceId || input.sourceVersionId !== context.sourceVersionId || input.operationId !== context.operationId) {
    throw new GuidedRegenerationFailureError({
      code: 'source_mismatch', stage: 'context', safeMessage: '来源版本与操作上下文不匹配，请刷新后重试。',
      retryable: false, submissionState: 'not_submitted',
    });
  }
}

export function createGuidedRegenerationService<
  TContext extends GuidedRevisionContext = GuidedRevisionContext,
  TPlan = unknown,
  TResult = unknown,
>(dependencies: GuidedRegenerationDependencies<TContext, TPlan, TResult>) {
  const storePending = async (candidate: GuidedImageCandidate<TPlan>, principal: unknown) => {
    try { await dependencies.savePending(candidate, principal); }
    catch (error) { throw failure(error, 'store', '保存待处理的生成方案失败；原图片仍保留。'); }
  };

  const generateCandidate = async (candidate: GuidedImageCandidate<TPlan>, context: TContext, principal: unknown) => {
    let result: TResult;
    try {
      result = await dependencies.generateImage({ prompt: candidate.generationPrompt, context, operationId: candidate.operationId, principal });
    } catch (error) {
      const submissionState = error instanceof GuidedRegenerationFailureError ? error.failure.submissionState : 'unknown';
      const safeFailure = failure(error, 'generate', '图像生成失败；原版本已保留。', submissionState);
      await storePending({ ...candidate, submissionState: safeFailure.failure.submissionState }, principal);
      throw safeFailure;
    }

    const readyToStore = { ...candidate, generatedResult: result, submissionState: 'submitted' as const };
    await storePending(readyToStore, principal);
    try {
      await dependencies.appendVersion(result, readyToStore, principal);
      await dependencies.clearPending(candidate.operationId, principal);
    } catch (error) {
      throw failure(error, 'store', '图片已生成，但保存版本失败；请重试保存，不要重新生成。', 'submitted');
    }
    return { candidate: readyToStore, result };
  };

  return {
    async submit(input: GuidedRegenerationInput, principal: unknown) {
      if (!input || typeof input !== 'object'
        || typeof input.sourceId !== 'string' || !input.sourceId.trim()
        || typeof input.sourceVersionId !== 'string' || !input.sourceVersionId.trim()
        || typeof input.operationId !== 'string' || !input.operationId.trim()
        || typeof input.guidance !== 'string' || input.guidance.length > 2000) {
        throw failure(new Error(), 'context', '请求信息不完整或超出长度限制。');
      }

      let context: TContext;
      try {
        context = await dependencies.loadContext({ sourceId: input.sourceId, sourceVersionId: input.sourceVersionId, operationId: input.operationId }, principal);
        assertIdentity(input, context);
      } catch (error) { throw failure(error, 'context', '无法读取当前选中版本的生成上下文。'); }

      let revisedPrompt = context.sourceImagePrompt;
      let plan: TPlan | null = context.planSnapshot as TPlan | null;
      let summary: string[] = [];
      if (input.guidance.trim()) {
        let parsed;
        try {
          const guidance = validateGuidedRevisionInput(input.guidance);
          parsed = parseGuidedRevisionResult<TPlan>(await dependencies.rewrite(buildGuidedRevisionPrompt(context, guidance)));
        } catch (error) { throw failure(error, 'rewrite', '指导意见改写失败；原版本已保留。'); }
        if (parsed.status === 'blocked') {
          throw new GuidedRegenerationFailureError({ code: 'revision_blocked', stage: 'rewrite', safeMessage: parsed.reason.slice(0, 500), retryable: false, submissionState: 'not_submitted' });
        }
        if (context.planSnapshot === null && parsed.updatedPlan !== null || context.planSnapshot !== null && parsed.updatedPlan === null) {
          throw failure(new Error(), 'validate', '改写后的策划结构与来源版本不兼容。');
        }
        try {
          plan = await dependencies.validatePlanRevision(context, parsed.updatedPlan);
          if (context.planSnapshot !== null && plan === null || context.planSnapshot === null && plan !== null) throw new Error('Plan presence changed.');
        }
        catch (error) { throw failure(error, 'validate', '改写后的策划未通过宿主校验；已停止生图。'); }
        revisedPrompt = parsed.revisedImagePrompt;
        summary = parsed.summary;
      }

      const candidate: GuidedImageCandidate<TPlan> = {
        sourceId: context.sourceId,
        sourceVersionId: context.sourceVersionId,
        operationId: context.operationId,
        userGuidance: input.guidance,
        generationPrompt: revisedPrompt,
        operationPromptUsed: revisedPrompt,
        planSnapshot: plan,
        summary,
        submissionState: 'not_submitted',
      };
      await storePending(candidate, principal);
      return generateCandidate(candidate, context, principal);
    },

    async retryGeneration(operationId: string, principal: unknown) {
      const candidate = await dependencies.loadPending(operationId, principal);
      if (!candidate) throw failure(new Error(), 'context', '没有可重试的待处理版本。');
      if (candidate.submissionState !== 'not_submitted') {
        throw new GuidedRegenerationFailureError({
          code: 'submission_not_retryable', stage: 'unknown', safeMessage: '任务是否已受理尚未确认，系统不会自动重复提交。',
          retryable: false, submissionState: candidate.submissionState,
        });
      }
      let context: TContext;
      try {
        context = await dependencies.loadContext({ sourceId: candidate.sourceId, sourceVersionId: candidate.sourceVersionId, operationId: candidate.operationId }, principal);
        if (context.sourceId !== candidate.sourceId || context.sourceVersionId !== candidate.sourceVersionId || context.operationId !== candidate.operationId) throw new Error();
      } catch (error) { throw failure(error, 'context', '无法恢复待处理版本的授权上下文。'); }
      return generateCandidate(candidate, context, principal);
    },

    async retryStore(operationId: string, principal: unknown) {
      const candidate = await dependencies.loadPending(operationId, principal);
      if (!candidate || candidate.generatedResult === undefined || candidate.submissionState !== 'submitted') {
        throw failure(new Error(), 'store', '没有可重试保存的已生成结果。', 'submitted');
      }
      try {
        await dependencies.appendVersion(candidate.generatedResult as TResult, candidate, principal);
        await dependencies.clearPending(operationId, principal);
        return candidate;
      } catch (error) { throw failure(error, 'store', '图片仍已生成；请重试保存版本。', 'submitted'); }
    },
  };
}
