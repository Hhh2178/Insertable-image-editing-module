export type ImageEditStage = 'input' | 'load' | 'compose' | 'upload' | 'submit' | 'poll' | 'result';
export type SubmissionState = 'not_submitted' | 'submitted' | 'unknown';

export interface ImageEditInput {
  operationId: string;
  sourceId: string;
  imageRef: string;
  instruction: string;
  markedOverlayPngDataUrl?: string;
}

export interface ImageEditResult {
  operationId: string;
  sourceId: string;
  imageUrl: string;
  promptUsed: string;
  provider: string;
  model: string;
}

export interface ImageEditFailure {
  code: string;
  stage: ImageEditStage;
  safeMessage: string;
  retryable: boolean;
  submissionState: SubmissionState;
}

export interface ImagePayload {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface ImageEditProviderInput {
  model: 'gemini-nano-banana-2.1';
  size: 'auto';
  resolution: '1K';
  prompt: string;
  images: [ImagePayload];
}

export interface ImageEditProvider {
  generate(input: ImageEditProviderInput): Promise<{
    imageUrl: string;
    provider: string;
    model: string;
  }>;
}

export interface ImageEditTransportEvents {
  onDispatched(): void;
}

export type ExecuteImageEdit = (input: ImageEditInput, events: ImageEditTransportEvents) => Promise<ImageEditResult>;

export interface ImageEditSource {
  id: string;
  imageRef: string;
  previewUrl: string;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}
