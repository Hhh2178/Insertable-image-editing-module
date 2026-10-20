import { useEffect, useRef, useState } from 'react';

export interface GuidedRegenerationRequest {
  guidance: string;
  mode: 'redraw' | 'guided';
}

export interface GuidedRegenerationDialogProps {
  open: boolean;
  onSubmit(
    request: GuidedRegenerationRequest,
    events: { onDispatched(): void },
  ): Promise<void>;
  onClose(): void;
}

const MAX_GUIDANCE_LENGTH = 2000;

export function GuidedRegenerationDialog({ open, onSubmit, onClose }: GuidedRegenerationDialogProps) {
  const [guidance, setGuidance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dispatched = useRef(false);

  useEffect(() => {
    if (open) dispatched.current = false;
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    dispatched.current = false;
    try {
      await onSubmit(
        { guidance, mode: guidance.trim() ? 'guided' : 'redraw' },
        { onDispatched: () => {
          if (dispatched.current) return;
          dispatched.current = true;
          onClose();
        } },
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '提交失败，请检查后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="image-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !submitting) onClose();
    }}>
      <section className="guided-regeneration-dialog" role="dialog" aria-modal="true" aria-labelledby="guided-regeneration-title">
        <header className="image-editor-header">
          <div>
            <span className="image-editor-eyebrow">IMAGE ITERATION · MOCK UI</span>
            <h2 id="guided-regeneration-title">带指导意见重新生成</h2>
            <p>输入你希望调整的部分；未填写时将直接按当前方案重新生成。</p>
          </div>
          <button className="image-editor-icon-button" type="button" aria-label="关闭指导意见窗口" disabled={submitting} onClick={onClose}>×</button>
        </header>

        <label className="image-editor-field-label" htmlFor="guided-regeneration-input">指导意见（可选）</label>
        <textarea
          id="guided-regeneration-input"
          className="image-editor-textarea guided-regeneration-textarea"
          value={guidance}
          maxLength={MAX_GUIDANCE_LENGTH}
          onChange={(event) => { setGuidance(event.target.value); setError(''); }}
          placeholder="例如：保留帽子和人物构图，将背景改成海边阳光场景。"
          disabled={submitting}
        />
        <div className="image-editor-field-meta">
          <span>{guidance.trim() ? '本轮意见只用于修改当前选中版本的生成方案。' : '留空即按当前方案重新生成，不调用改写环节。'}</span>
          <span>{guidance.length} / {MAX_GUIDANCE_LENGTH}</span>
        </div>
        {error && <p className="guided-regeneration-error" role="alert">{error}</p>}
        <div className="image-editor-actions">
          <button className="image-editor-button image-editor-button-secondary" type="button" disabled={submitting} onClick={onClose}>取消</button>
          <button className="image-editor-button image-editor-button-primary" type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? '提交中…' : '开始重新生成'}
          </button>
        </div>
      </section>
    </div>
  );
}
