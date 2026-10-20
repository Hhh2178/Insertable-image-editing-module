import type { ImageEditInput, ValidationIssue } from './types.js';

export const MAX_INSTRUCTION_LENGTH = 2000;

export function validateImageEditInput(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!input || typeof input !== 'object') {
    return [{ code: 'input_invalid', field: 'input', message: '编辑请求格式无效。' }];
  }
  const value = input as Partial<ImageEditInput>;
  if (typeof value.operationId !== 'string' || !value.operationId.trim()) {
    issues.push({ code: 'operation_required', field: 'operationId', message: '操作编号缺失。' });
  }
  if (typeof value.sourceId !== 'string' || !value.sourceId.trim()) {
    issues.push({ code: 'source_required', field: 'sourceId', message: '图片来源编号缺失。' });
  }
  if (typeof value.imageRef !== 'string' || !value.imageRef.trim()) {
    issues.push({ code: 'image_ref_required', field: 'imageRef', message: '图片引用缺失。' });
  }
  if (typeof value.instruction !== 'string' || !value.instruction.trim()) {
    issues.push({ code: 'instruction_required', field: 'instruction', message: '请填写编辑要求。' });
  } else if (value.instruction.length > MAX_INSTRUCTION_LENGTH) {
    issues.push({ code: 'instruction_too_long', field: 'instruction', message: `编辑要求不能超过 ${MAX_INSTRUCTION_LENGTH} 个字符。` });
  }
  if (value.markedOverlayPngDataUrl !== undefined && typeof value.markedOverlayPngDataUrl !== 'string') {
    issues.push({ code: 'overlay_invalid', field: 'markedOverlayPngDataUrl', message: '标注图片格式无效。' });
  }
  return issues;
}
