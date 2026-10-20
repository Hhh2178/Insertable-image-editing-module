export interface ImagePoint {
  x: number;
  y: number;
}

export interface ContainedImagePoint {
  point: ImagePoint;
  inside: boolean;
}

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Convert pointer coordinates to normalized image coordinates for object-fit: contain. */
export function mapPointerToContainedImage(
  clientX: number,
  clientY: number,
  bounds: ImageBounds,
  image: ImageSize,
): ContainedImagePoint | null {
  if (![clientX, clientY, bounds.left, bounds.top, bounds.width, bounds.height, image.width, image.height].every(Number.isFinite)) return null;
  if (bounds.width <= 0 || bounds.height <= 0 || image.width <= 0 || image.height <= 0) return null;

  const scale = Math.min(bounds.width / image.width, bounds.height / image.height);
  const renderedWidth = image.width * scale;
  const renderedHeight = image.height * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const x = (clientX - bounds.left - offsetX) / renderedWidth;
  const y = (clientY - bounds.top - offsetY) / renderedHeight;
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;

  return {
    point: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) },
    inside,
  };
}
