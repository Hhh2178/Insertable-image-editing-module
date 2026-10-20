import { useState } from 'react';
import type { ImageEditInput, ImageEditResult } from './core/types.js';
import { ImageEditorDialog } from './react/ImageEditorDialog.js';

const source = {
  id: 'demo-version-v2',
  imageRef: 'demo://sun-hat/version-v2',
  previewUrl: '/sample-product.svg',
};

export function App() {
  const [open, setOpen] = useState(true);
  const [status, setStatus] = useState('本地 Express mock 演示：不会连接任何图像服务商。');
  const [failNext, setFailNext] = useState(false);

  const execute = async (input: ImageEditInput, events: { onDispatched(): void }): Promise<ImageEditResult> => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (failNext) headers.set('x-demo-fail-next', 'true');
    events.onDispatched();
    setFailNext(false);
    const response = await fetch('/api/image-edit', { method: 'POST', headers, body: JSON.stringify(input) });
    const payload = await response.json() as ImageEditResult | { failure: import('./core/types.js').ImageEditFailure };
    if (!response.ok || 'failure' in payload) throw 'failure' in payload ? payload.failure : new Error('本地示例服务请求失败。');
    setStatus(`Mock 已完成操作 ${payload.operationId.slice(0, 12)}，来源 ${payload.sourceId}；仅请求本机示例服务。`);
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
          <span className="demo-eyebrow">宿主接入示例</span>
          <h2>当前选中版本</h2>
          <p>商品主视觉 · V2 · sourceId: {source.id}</p>
          <p className="demo-status" role="status">{status}</p>
          <label className="demo-fail-toggle">
            <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />
            下次提交模拟失败
          </label>
          <button className="demo-open-button" type="button" onClick={() => setOpen(true)}>图像编辑</button>
        </div>
        <div className="demo-image-wrap"><img src={source.previewUrl} alt="演示用的太阳帽商品图片" /></div>
      </section>

      <p className="demo-footnote">此页面只使用合成素材与本地 Express mock，不读取密钥、不调用 APIMart，也不把图片上传到外部。</p>

      <ImageEditorDialog
        open={open}
        source={source}
        execute={execute}
        onClose={() => setOpen(false)}
        onSuccess={() => setStatus('Mock 结果回调成功：宿主可将结果追加为新版本。')}
        onError={(failure) => { setStatus(failure.safeMessage); setOpen(true); }}
      />
    </main>
  );
}
