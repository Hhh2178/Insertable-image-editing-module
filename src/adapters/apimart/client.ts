import { ImageEditFailureError, imageEditFailure } from '../../core/errors.js';
import type { ImageEditProvider, ImageEditProviderInput } from '../../core/types.js';
import { normalizeApimartImageUrl, normalizeApimartTaskId } from './normalize-result.js';

const APIMART_V1 = 'https://api.apimart.ai/v1';

export interface ApimartProviderOptions {
  getApiKey(): string;
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
}

function responsePayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

async function readJson(response: Response, stage: 'upload' | 'submit' | 'poll', state: 'not_submitted' | 'submitted' | 'unknown'): Promise<unknown> {
  try {
    return await response.json();
  } catch (cause) {
    throw new ImageEditFailureError(imageEditFailure('provider_response_invalid', stage, '图像服务返回了无法读取的响应。', { submissionState: state }), cause);
  }
}

function taskStatus(payload: unknown): string | undefined {
  const record = responsePayload(payload);
  const data = responsePayload(record.data);
  const value = data.status ?? record.status;
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

export function createApimartImageProvider(options: ApimartProviderOptions): ImageEditProvider {
  const fetcher = options.fetch ?? globalThis.fetch;
  const wait = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const timeout = options.requestTimeoutMs ?? 60_000;
  const interval = options.pollIntervalMs ?? 5_000;
  const maxAttempts = options.maxPollAttempts ?? 60;

  async function request(url: string, init: RequestInit, stage: 'upload' | 'submit' | 'poll'): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      return await fetcher(url, { ...init, signal: controller.signal });
    } catch (cause) {
      const failure = stage === 'submit'
        ? imageEditFailure('provider_submit_unknown', 'submit', '图像请求状态暂时无法确认，请检查任务状态后再操作。', { submissionState: 'unknown' })
        : imageEditFailure(stage === 'upload' ? 'provider_upload_failed' : 'provider_poll_failed', stage, stage === 'upload' ? '图片上传失败，请重试。' : '图像任务状态暂时无法查询。', { retryable: false, submissionState: stage === 'upload' ? 'not_submitted' : 'submitted' });
      throw new ImageEditFailureError(failure, cause);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async generate(input: ImageEditProviderInput) {
      if (input.images.length !== 1) throw new ImageEditFailureError(imageEditFailure('image_count_invalid', 'input', '每次图像编辑必须且只能提供一张图片。'));
      let apiKey: string;
      try {
        apiKey = options.getApiKey().trim();
      } catch (cause) {
        throw new ImageEditFailureError(imageEditFailure('provider_key_unavailable', 'input', '图像服务配置不可用。'), cause);
      }
      if (!apiKey) throw new ImageEditFailureError(imageEditFailure('provider_key_unavailable', 'input', '图像服务配置不可用。'));
      const headers = { Authorization: `Bearer ${apiKey}` };
      const image = input.images[0];
      const file = new Blob([image.bytes as BlobPart], { type: image.mimeType });
      const form = new FormData();
      form.append('file', file, image.mimeType === 'image/jpeg' ? 'edited-image.jpg' : image.mimeType === 'image/webp' ? 'edited-image.webp' : 'edited-image.png');
      const upload = await request(`${APIMART_V1}/uploads/images`, { method: 'POST', headers, body: form }, 'upload');
      if (!upload.ok) throw new ImageEditFailureError(imageEditFailure('provider_upload_rejected', 'upload', '图像服务未能接收编辑图片。', { retryable: upload.status >= 500 }));
      const uploadPayload = await readJson(upload, 'upload', 'not_submitted');
      const uploadUrl = responsePayload(uploadPayload).url;
      if (typeof uploadUrl !== 'string' || !isAllowedImageUrl(uploadUrl)) {
        throw new ImageEditFailureError(imageEditFailure('provider_upload_result_invalid', 'upload', '图像服务未返回有效的图片地址。'));
      }

      const submitPrompt = (prompt: string) => request(`${APIMART_V1}/images/generations`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: input.model, prompt, n: 1, size: input.size, resolution: input.resolution, image_urls: [uploadUrl] }),
      }, 'submit');
      let create = await submitPrompt(input.prompt);
      if (create.status === 451) {
        // Only an explicit moderation rejection is safe to retry; preserve the exact original prompt.
        const clarifiedPrompt = `Please review this request for permitted, benign image editing. If it is allowed, follow it; otherwise reject it.\n\n${input.prompt}`;
        create = await submitPrompt(clarifiedPrompt);
      }
      if (!create.ok) {
        const state = create.status >= 500 ? 'unknown' : 'not_submitted';
        throw new ImageEditFailureError(imageEditFailure('provider_submit_rejected', 'submit', '图像服务拒绝了本次请求。', { retryable: create.status >= 500, submissionState: state }));
      }
      const createPayload = await readJson(create, 'submit', 'unknown');
      const taskId = normalizeApimartTaskId(createPayload);
      if (!taskId) throw new ImageEditFailureError(imageEditFailure('provider_task_id_missing', 'submit', '图像服务未返回任务编号，请检查服务状态后再操作。', { submissionState: 'unknown' }));

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const poll = await request(`${APIMART_V1}/tasks/${encodeURIComponent(taskId)}`, { method: 'GET', headers }, 'poll');
        if (!poll.ok) throw new ImageEditFailureError(imageEditFailure('provider_poll_rejected', 'poll', '图像任务状态查询失败。', { retryable: poll.status >= 500, submissionState: 'submitted' }));
        const payload = await readJson(poll, 'poll', 'submitted');
        const status = taskStatus(payload);
        if (status === 'completed' || status === 'success' || status === 'succeeded') {
          const imageUrl = normalizeApimartImageUrl(payload);
          if (!imageUrl) throw new ImageEditFailureError(imageEditFailure('provider_result_missing', 'result', '图像任务已完成，但没有可用的结果图片。', { submissionState: 'submitted' }));
          return { imageUrl, provider: 'apimart' as const, model: input.model };
        }
        if (status === 'failed' || status === 'error' || status === 'cancelled') {
          throw new ImageEditFailureError(imageEditFailure('provider_task_failed', 'poll', '图像生成任务失败，请检查任务详情。', { submissionState: 'submitted' }));
        }
        if (attempt + 1 < maxAttempts) await wait(interval);
      }
      throw new ImageEditFailureError(imageEditFailure('provider_poll_timeout', 'poll', '图像任务仍在处理中，请稍后查看任务状态。', { retryable: false, submissionState: 'submitted' }));
    },
  };
}

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
