import type { ImageEditFailure, ImageEditStage, SubmissionState } from './types.js';

export class ImageEditFailureError extends Error {
  readonly failure: ImageEditFailure;
  readonly cause?: unknown;

  constructor(failure: ImageEditFailure, cause?: unknown) {
    super(failure.safeMessage);
    this.name = 'ImageEditFailureError';
    this.failure = Object.freeze({ ...failure });
    Object.defineProperty(this, 'cause', { value: cause, enumerable: false, writable: false });
  }
}

export function imageEditFailure(
  code: string,
  stage: ImageEditStage,
  safeMessage: string,
  options: { retryable?: boolean; submissionState?: SubmissionState } = {},
): ImageEditFailure {
  return {
    code,
    stage,
    safeMessage,
    retryable: options.retryable ?? false,
    submissionState: options.submissionState ?? 'not_submitted',
  };
}

export function toSafeImageEditFailure(failure: unknown): ImageEditFailure {
  if (failure instanceof ImageEditFailureError) return { ...failure.failure };
  if (failure && typeof failure === 'object') {
    const value = failure as Partial<ImageEditFailure>;
    const stages = new Set(['input', 'load', 'compose', 'upload', 'submit', 'poll', 'result']);
    const states = new Set(['not_submitted', 'submitted', 'unknown']);
    if (typeof value.code === 'string' && stages.has(value.stage ?? '') && typeof value.safeMessage === 'string' && states.has(value.submissionState ?? '')) {
      return {
        code: value.code.slice(0, 80),
        stage: value.stage!,
        safeMessage: value.safeMessage.slice(0, 500),
        retryable: value.retryable === true,
        submissionState: value.submissionState!,
      };
    }
  }
  return imageEditFailure('image_edit_failed', 'result', '图像编辑失败，请检查状态后再重试。', {
    retryable: false,
    submissionState: 'unknown',
  });
}
