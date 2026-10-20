import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Check, Eraser, Redo2, Undo2, X } from 'lucide-react';
import { toSafeImageEditFailure } from '../core/errors.js';
import { mapPointerToContainedImage, type ImagePoint } from '../core/image-coordinates.js';
import type { ImageEditFailure, ImageEditInput, ImageEditResult, ImageEditSource } from '../core/types.js';

export interface ImageEditDialogProps {
  open: boolean;
  source?: ImageEditSource;
  disabled?: boolean;
  execute: (input: ImageEditInput, events: { onDispatched(): void }) => Promise<ImageEditResult>;
  onClose(): void;
  onSuccess(result: ImageEditResult): void;
  onError(failure: ImageEditFailure): void;
}

interface Stroke {
  points: ImagePoint[];
  color: string;
  size: number;
  eraser: boolean;
}

const MAX_TEXT_LENGTH = 2000;
const BRUSH_SIZES = [4, 9, 18] as const;
const BRUSH_LABELS = ['小', '中', '大'] as const;
const BRUSH_COLORS = [
  { name: '红色', value: '#ef4444' },
  { name: '黄色', value: '#facc15' },
  { name: '蓝色', value: '#3b82f6' },
] as const;

function createOperationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function drawStrokes(canvas: HTMLCanvasElement | null, strokes: Stroke[], width: number, height: number): void {
  if (!canvas || width <= 0 || height <= 0) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    context.save();
    context.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = stroke.size;
    if (stroke.points.length === 1) {
      const [point] = stroke.points;
      context.beginPath();
      context.arc(point.x, point.y, stroke.eraser ? stroke.size / 2 : stroke.size / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    context.restore();
  }
}

export function ImageEditorDialog({ open, source, disabled = false, execute, onClose, onSuccess, onError }: ImageEditDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [instruction, setInstruction] = useState('');
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);
  const [brushColor, setBrushColor] = useState<string>(BRUSH_COLORS[0].value);
  const [isEraser, setIsEraser] = useState(false);
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const strokes = history[historyIndex] ?? [];
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const canSubmit = Boolean(source && instruction.trim()) && !disabled && !submitting;
  const frameStyle = useMemo(() => imageSize.width > 0 && imageSize.height > 0
    ? { aspectRatio: `${imageSize.width} / ${imageSize.height}` }
    : undefined, [imageSize]);

  useEffect(() => {
    drawStrokes(canvasRef.current, strokes, imageSize.width, imageSize.height);
  }, [strokes, imageSize]);

  useEffect(() => {
    setInstruction('');
    setHistory([[]]);
    setHistoryIndex(0);
    setMessage('');
    setImageSize({ width: 0, height: 0 });
  }, [source?.id]);

  const commitStrokes = (next: Stroke[]) => {
    const trimmed = history.slice(0, historyIndex + 1);
    const updated = [...trimmed, next];
    setHistory(updated);
    setHistoryIndex(updated.length - 1);
  };

  const getPoint = (event: PointerEvent<HTMLCanvasElement>): ImagePoint | null => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const mapped = mapPointerToContainedImage(event.clientX, event.clientY, bounds, imageSize);
    if (!mapped?.inside) return null;
    return { x: mapped.point.x * imageSize.width, y: mapped.point.y * imageSize.height };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled || submitting || !source || imageSize.width <= 0 || imageSize.height <= 0) return;
    const point = getPoint(event);
    if (!point) return;
    event.preventDefault();
    drawingRef.current = true;
    activeStrokeRef.current = { points: [point], color: brushColor, size: brushSize, eraser: isEraser };
    drawStrokes(canvasRef.current, [...strokes, activeStrokeRef.current], imageSize.width, imageSize.height);
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    const point = getPoint(event);
    if (!point) return;
    activeStrokeRef.current.points.push(point);
    drawStrokes(canvasRef.current, [...strokes, activeStrokeRef.current], imageSize.width, imageSize.height);
  };

  const handlePointerUp = () => {
    if (!drawingRef.current || !activeStrokeRef.current) return;
    drawingRef.current = false;
    commitStrokes([...strokes, activeStrokeRef.current]);
    activeStrokeRef.current = null;
  };

  const handleClose = () => {
    if (submitting) return;
    setInstruction('');
    setHistory([[]]);
    setHistoryIndex(0);
    setMessage('');
    onClose();
  };

  const submit = async () => {
    if (!canSubmit || !source) return;
    setSubmitting(true);
    setMessage('');
    const input: ImageEditInput = {
      operationId: createOperationId(),
      sourceId: source.id,
      imageRef: source.imageRef,
      instruction,
      markedOverlayPngDataUrl: strokes.length > 0 ? canvasRef.current?.toDataURL('image/png') : undefined,
    };

    try {
      const result = await execute(input, {
        onDispatched: () => {
          onClose();
        },
      });
      setInstruction('');
      setHistory([[]]);
      setHistoryIndex(0);
      onSuccess(result);
    } catch (failure) {
      const safeFailure = toSafeImageEditFailure(failure);
      setMessage(safeFailure.safeMessage);
      onError(safeFailure);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !source) return null;

  return (
    <div className="image-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && handleClose()}>
      <section className="image-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="image-edit-title">
        <header className="image-editor-header">
          <div>
            <span className="image-editor-eyebrow">基于当前选中版本编辑</span>
            <h2 id="image-edit-title">标记需要修改的区域</h2>
            <p>原图保持不变，笔迹仅用于定位修改范围</p>
          </div>
          <button type="button" className="image-editor-icon-button" aria-label="关闭图像编辑弹窗" onClick={handleClose}><X size={18} /></button>
        </header>

        <div className="image-editor-toolbar" role="toolbar" aria-label="画笔工具">
          <div className="image-editor-tool-group" aria-label="画笔粗细">
            {BRUSH_SIZES.map((size, index) => (
              <button key={size} type="button" className={`image-editor-tool-button ${brushSize === size && !isEraser ? 'is-active' : ''}`} onClick={() => { setBrushSize(size); setIsEraser(false); }} aria-pressed={brushSize === size && !isEraser} aria-label={`${BRUSH_LABELS[index]}号画笔`}>
                <span className="image-editor-brush-dot" style={{ width: size, height: size }} />{BRUSH_LABELS[index]}
              </button>
            ))}
          </div>
          <div className="image-editor-tool-group" aria-label="画笔颜色">
            {BRUSH_COLORS.map((color) => (
              <button key={color.value} type="button" className={`image-editor-color-button ${brushColor === color.value && !isEraser ? 'is-active' : ''}`} style={{ '--swatch': color.value } as React.CSSProperties} onClick={() => { setBrushColor(color.value); setIsEraser(false); }} aria-label={color.name} aria-pressed={brushColor === color.value && !isEraser} />
            ))}
          </div>
          <div className="image-editor-tool-group image-editor-history-tools">
            <button type="button" className={`image-editor-tool-button ${isEraser ? 'is-active' : ''}`} onClick={() => setIsEraser((value) => !value)} aria-pressed={isEraser}><Eraser size={14} />橡皮擦</button>
            <button type="button" className="image-editor-tool-button" onClick={() => canUndo && setHistoryIndex((index) => index - 1)} disabled={!canUndo}><Undo2 size={14} />撤销</button>
            <button type="button" className="image-editor-tool-button" onClick={() => canRedo && setHistoryIndex((index) => index + 1)} disabled={!canRedo}><Redo2 size={14} />重做</button>
            <button type="button" className="image-editor-tool-button image-editor-clear-button" onClick={() => commitStrokes([])} disabled={strokes.length === 0}><X size={14} />清空</button>
          </div>
        </div>

        <div className="image-editor-canvas-frame" style={frameStyle}>
          <img
            className="image-editor-source-image"
            src={source.previewUrl}
            alt="当前选中版本原图"
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
          <canvas
            ref={canvasRef}
            className="image-editor-annotation-canvas"
            aria-label="在图片上涂抹需要修改的区域"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
          <span className="image-editor-canvas-hint">在图上涂抹需要调整的区域</span>
        </div>

        <label className="image-editor-field-label" htmlFor="image-edit-instruction">编辑要求 <span>必填</span></label>
        <textarea
          id="image-edit-instruction"
          className="image-editor-textarea"
          value={instruction}
          maxLength={MAX_TEXT_LENGTH}
          rows={3}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="描述希望如何修改。若有涂抹标记，模型会参考标注图中的范围。"
          aria-describedby="image-edit-validation image-edit-counter"
          aria-invalid={!instruction.trim()}
        />
        <div className="image-editor-field-meta">
          <span id="image-edit-validation" className={!instruction.trim() ? 'image-editor-validation' : ''}>{instruction.trim() ? '已选版本的原图不会被覆盖' : '请填写编辑要求后再提交'}</span>
          <span id="image-edit-counter">{instruction.length} / {MAX_TEXT_LENGTH}</span>
        </div>
        {message && <p className="image-editor-notice" role="status">{message}</p>}

        <footer className="image-editor-actions">
          <button type="button" className="image-editor-button image-editor-button-secondary" onClick={handleClose} disabled={submitting}>取消</button>
          <button type="button" className="image-editor-button image-editor-button-primary" onClick={() => void submit()} disabled={!canSubmit}>
            <Check size={16} />{submitting ? '处理中…' : '提交编辑'}
          </button>
        </footer>
      </section>
    </div>
  );
}
