function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findUrl(item);
      if (url) return url;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of ['url', 'image_url', 'imageUrl']) {
    if (typeof value[key] === 'string') return value[key] as string;
  }
  return undefined;
}

export function normalizeApimartImageUrl(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const data = isRecord(payload.data) ? payload.data : payload;
  const result = isRecord(data.result) ? data.result : {};
  const output = isRecord(data.output) ? data.output : {};
  const candidates = [
    result.images, result.image, result.image_url, result.imageUrl,
    output.resultUrls, output.result_urls, output.images, output.image_url, output.imageUrl,
    data.primary_url, data.image_url, data.imageUrl, data.url,
    payload.primary_url, payload.image_url, payload.imageUrl, payload.url,
  ];
  for (const candidate of candidates) {
    const value = findUrl(candidate);
    if (!value) continue;
    try {
      const url = new URL(value);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password) return url.toString();
    } catch {
      // Ignore malformed provider output and try the remaining documented shapes.
    }
  }
  return undefined;
}

export function normalizeApimartTaskId(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  const data = payload.data;
  const candidates: unknown[] = [
    isRecord(data) ? data.task_id : undefined,
    isRecord(data) ? data.id : undefined,
    Array.isArray(data) && isRecord(data[0]) ? data[0].task_id : undefined,
    Array.isArray(data) && isRecord(data[0]) ? data[0].id : undefined,
    payload.task_id,
    payload.id,
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)?.trim();
}
