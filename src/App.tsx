import { useState } from 'react';
import type { ImageEditInput, ImageEditResult } from './core/types.js';
import { ImageEditorDialog } from './react/ImageEditorDialog.js';
import { GuidedRegenerationDialog, type GuidedRegenerationRequest } from './react/GuidedRegenerationDialog.js';

const versions = [
  { id: 'demo-version-v1', imageRef: 'demo://sun-hat/demo-version-v1', label: 'V1 · 当前方案', operation: 'current-plan', previewUrl: '/sample-product.svg', sourceVersionId: 'demo-version-v1', generationPrompt: 'Create a clean product hero image of a beige sun hat in a bright summer field.', operationPromptUsed: 'Create a clean product hero image of a beige sun hat in a bright summer field.' },
  { id: 'demo-version-v2', imageRef: 'demo://sun-hat/demo-version-v2', label: 'V2 · 当前版本', operation: 'image-edit', previewUrl: '/sample-product.svg', sourceVersionId: 'demo-version-v2', generationPrompt: 'A woman wearing a beige sun hat in a summer landscape, balanced product composition.', operationPromptUsed: 'Keep the hat and remove the mask.' },
];
type DemoVersion = (typeof versions)[number] | {
  id: string; imageRef: string; label: string; operation: string; previewUrl: string;
  sourceVersionId: string; generationPrompt: string; operationPromptUsed: string;
};

export function App() {
  const [sessionVersions, setSessionVersions] = useState<DemoVersion[]>(versions);
  const [editorOpen, setEditorOpen] = useState(false);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(versions[1].id);
  const [status, setStatus] = useState('本地 Express mock：图像迭代会显示合成结果，不连接真实模型。');
  const [failNext, setFailNext] = useState(false);
  const [failNextIteration, setFailNextIteration] = useState(false);
  const [pendingOperationId, setPendingOperationId] = useState('');
  const [iterationFailure, setIterationFailure] = useState<{ stage: string; submissionState: string } | undefined>();
  const source = sessionVersions.find((version) => version.id === selectedVersionId) ?? sessionVersions[0];

  const addIterationVersion = (payload: {
    candidate: { operationId: string; sourceId: string; sourceVersionId: string; operationType: string; generationPrompt: string; operationPromptUsed: string };
    result: { operationId: string; sourceId: string; imageUrl: string; promptUsed: string };
  }) => {
    setSessionVersions((current) => {
      if (current.some((version) => version.id === payload.candidate.operationId)) return current;
      const label = payload.candidate.operationType === 'guided-regenerate' ? '指导重生' : '按当前方案重抽';
      return [...current, {
        id: payload.candidate.operationId,
        imageRef: `demo://sun-hat/${payload.candidate.operationId}`,
        label: `V${current.length + 1} · ${label}`,
        operation: payload.candidate.operationType,
        previewUrl: payload.result.imageUrl,
        sourceVersionId: payload.candidate.sourceVersionId,
        generationPrompt: payload.candidate.generationPrompt,
        operationPromptUsed: payload.candidate.operationPromptUsed,
      }];
    });
    setSelectedVersionId(payload.candidate.operationId);
    setPendingOperationId('');
    setIterationFailure(undefined);
    setStatus(`Mock 已完成${payload.candidate.operationType === 'guided-regenerate' ? '指导重生' : '当前方案重抽'}，结果已追加为新版本。`);
  };

  const readFailure = async (response: Response) => {
    const payload = await response.json() as { failure?: { safeMessage?: string; stage?: string; submissionState?: string } };
    const safeMessage = payload.failure?.safeMessage ?? '本地示例请求失败，请检查状态。';
    setIterationFailure({ stage: payload.failure?.stage ?? 'unknown', submissionState: payload.failure?.submissionState ?? 'unknown' });
    setStatus(safeMessage);
    return safeMessage;
  };

  const dispatchIteration = async (request: GuidedRegenerationRequest, events: { onDispatched(): void }) => {
    const operationId = `op-${globalThis.crypto.randomUUID()}`;
    const sourceSnapshot = source;
    setPendingOperationId(operationId);
    setIterationFailure(undefined);
    setStatus(request.mode === 'guided' ? '正在本地 mock 指导改写并生成图片…' : '正在按当前方案执行本地 mock 重抽…');
    events.onDispatched();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (failNextIteration) headers.set('x-demo-fail-iteration', 'true');
    setFailNextIteration(false);
    try {
      const response = await fetch('/api/image-iterations', {
        method: 'POST', headers,
        body: JSON.stringify({ sourceId: sourceSnapshot.id, sourceVersionId: sourceSnapshot.id, operationId, mode: request.mode, guidance: request.guidance }),
      });
      if (!response.ok) throw new Error(await readFailure(response));
      addIterationVersion(await response.json());
    } catch (error) {
      if (error instanceof Error) setStatus(error.message);
    }
  };

  const retryPending = async (action: 'image' | 'store') => {
    if (!pendingOperationId) return;
    setStatus(action === 'image' ? '正在仅重试生图，不会重复改写提示词…' : '正在保存已生成图片版本…');
    try {
      const endpoint = action === 'image' ? 'retry-image' : 'retry-store';
      const response = await fetch(`/api/image-iterations/${encodeURIComponent(pendingOperationId)}/${endpoint}`, { method: 'POST' });
      if (!response.ok) { await readFailure(response); return; }
      const payload = await response.json();
      if (payload.result) addIterationVersion(payload);
      else { setPendingOperationId(''); setIterationFailure(undefined); setStatus('Mock 版本保存已完成。'); }
    } catch { setStatus('本地重试暂不可用；原版本与待处理状态仍保留。'); }
  };

  const execute = async (input: ImageEditInput, events: { onDispatched(): void }): Promise<ImageEditResult> => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (failNext) headers.set('x-demo-fail-next', 'true');
    events.onDispatched();
    setFailNext(false);
    const response = await fetch('/api/image-edit', { method: 'POST', headers, body: JSON.stringify(input) });
    const payload = await response.json() as ImageEditResult | { failure: import('./core/types.js').ImageEditFailure };
    if (!response.ok || 'failure' in payload) throw 'failure' in payload ? payload.failure : new Error('本地示例服务请求失败。');
    setStatus(`Mock 已完成图像编辑 ${payload.operationId.slice(0, 12)}，来源 ${payload.sourceId}；仅请求本机示例服务。`);
    return payload;
  };

  return (
    <main className="demo-shell">
      <div className="demo-topline">
        <span className="demo-mark">IE</span>
        <div>
          <p className="demo-kicker">IMAGE EDITOR MODULE</p>
          <h1>独立图像编辑器预览</h1>
        </div>
        <span className="demo-badge">UI 壳 · Mock</span>
      </div>

      <section className="demo-card" aria-label="宿主图片卡片示例">
        <div className="demo-card-copy">
          <span className="demo-eyebrow">宿主接入示例 · 当前会话</span>
          <h2>新品主视觉</h2>
          <p>选中 {source.label} · sourceId: {source.id} · 来源版本: {source.sourceVersionId}</p>
          <p className="demo-status" role="status">{status}</p>
          {iterationFailure?.stage === 'generate' && iterationFailure.submissionState === 'not_submitted' && pendingOperationId && <button className="image-iteration-action" type="button" onClick={() => { void retryPending('image'); }}>↻ 仅重试生图</button>}
          {iterationFailure?.stage === 'store' && pendingOperationId && <button className="image-iteration-action" type="button" onClick={() => { void retryPending('store'); }}>保存已生成版本</button>}
          <label className="demo-fail-toggle">
            <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />
            图像编辑下次提交模拟失败
          </label>
          <label className="demo-fail-toggle">
            <input type="checkbox" checked={failNextIteration} onChange={(event) => setFailNextIteration(event.target.checked)} />
            下一次图像迭代模拟生图失败（验证仅重试生图）
          </label>
          <div className="image-iteration-actions" aria-label="图像操作">
            <button className="image-iteration-action image-iteration-action-primary" type="button" disabled={Boolean(pendingOperationId)} onClick={() => { void dispatchIteration({ mode: 'redraw', guidance: '' }, { onDispatched() {} }); }}>✦ 按当前方案重抽</button>
            <button className="image-iteration-action" type="button" onClick={() => setGuidanceOpen(true)}>↻ 带指导意见重生</button>
            <button className="image-iteration-action" type="button" onClick={() => setEditorOpen(true)}>▧ 图像编辑</button>
          </div>
          <div className="image-iteration-versions" aria-label="历史版本">
            {sessionVersions.map((version) => (
              <button className={`image-iteration-version${version.id === source.id ? ' is-current' : ''}`} key={version.id} type="button" aria-pressed={version.id === source.id} onClick={() => setSelectedVersionId(version.id)}>
                <img src={version.previewUrl} alt="" />
                <span><strong>{version.label}</strong><small>{version.operation}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="demo-image-wrap"><img src={source.previewUrl} alt="演示用的太阳帽商品图片" /><span className="demo-image-caption">当前选中 · {source.label}</span></div>
      </section>

      <p className="demo-footnote">此页面仅连接本地 Express mock，生成图为合成预览，不调用 APIMart 或其它外部模型，也不把图片上传到外部。</p>

      <ImageEditorDialog
        open={editorOpen}
        source={source}
        execute={execute}
        onClose={() => setEditorOpen(false)}
        onSuccess={(result) => {
          setSessionVersions((existing) => [...existing, {
            id: result.operationId, imageRef: `demo://sun-hat/${result.operationId}`,
            label: `V${existing.length + 1} · 图像编辑`, operation: 'image-edit', previewUrl: result.imageUrl,
            sourceVersionId: source.id, generationPrompt: source.generationPrompt, operationPromptUsed: result.promptUsed,
          }]);
          setSelectedVersionId(result.operationId);
          setStatus('本地 mock 图像编辑已完成，并追加为新会话版本。');
        }}
        onError={(failure) => { setStatus(failure.safeMessage); setEditorOpen(true); }}
      />
      <GuidedRegenerationDialog
        open={guidanceOpen}
        onSubmit={dispatchIteration}
        onClose={() => setGuidanceOpen(false)}
      />
    </main>
  );
}
