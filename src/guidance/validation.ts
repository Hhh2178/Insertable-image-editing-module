import { MAX_GUIDANCE_LENGTH, type GuidedRevisionResult } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== [...expected].sort()[index])) {
    throw new TypeError('改写结果包含缺失或未授权字段。');
  }
}

export function validateGuidedRevisionInput(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('指导意见必须是文本。');
  if (!value.trim()) throw new TypeError('指导意见不能为空。');
  if (value.length > MAX_GUIDANCE_LENGTH) throw new RangeError(`指导意见不能超过 ${MAX_GUIDANCE_LENGTH} 个字符。`);
  return value;
}

/** Validates only the generic LLM response contract; host must validate business plan fields. */
export function parseGuidedRevisionResult<TPlan = unknown>(raw: unknown): GuidedRevisionResult<TPlan> {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > 250_000) throw new RangeError('改写响应超过安全长度限制。');
    try { value = JSON.parse(raw) as unknown; }
    catch { throw new TypeError('改写响应不是有效 JSON。'); }
  }
  if (!isRecord(value) || typeof value.status !== 'string') throw new TypeError('改写响应结构无效。');
  if (value.status === 'blocked') {
    assertExactKeys(value, ['status', 'reason']);
    if (typeof value.reason !== 'string' || !value.reason.trim()) throw new TypeError('改写阻断结果缺少说明。');
    return { status: 'blocked', reason: value.reason.trim() };
  }
  if (value.status !== 'ok') throw new TypeError('改写响应状态无效。');
  assertExactKeys(value, ['status', 'updatedPlan', 'revisedImagePrompt', 'summary']);
  if (!(value.updatedPlan === null || isRecord(value.updatedPlan))) throw new TypeError('更新后的策划必须是对象或 null。');
  if (typeof value.revisedImagePrompt !== 'string' || !value.revisedImagePrompt.trim()) throw new TypeError('修订后的完整生图提示词不能为空。');
  if (!Array.isArray(value.summary) || value.summary.length === 0 || value.summary.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new TypeError('改写摘要必须至少包含一条非空文本。');
  }
  return {
    status: 'ok',
    updatedPlan: value.updatedPlan as TPlan | null,
    revisedImagePrompt: value.revisedImagePrompt,
    summary: value.summary as string[],
  };
}
