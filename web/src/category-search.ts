import type { ParsedDataset } from "./dataset";
import { columnPosition, isMissing } from "./data-engine";

export type CategoryValue = string | number | boolean;

function categoryKey(value: CategoryValue): string {
  return `${typeof value}:${String(value)}`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function searchCategoryValues(
  dataset: ParsedDataset,
  feature: string,
  rowIndices: number[] | undefined,
  query: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<CategoryValue[]> {
  const position = columnPosition(dataset, feature);
  const indices = rowIndices ?? dataset.rows.map((_, index) => index);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = new Map<string, CategoryValue>();

  for (let offset = 0; offset < indices.length && matches.size < limit; offset += 2000) {
    if (signal?.aborted) throw new DOMException("Category search cancelled.", "AbortError");
    const end = Math.min(indices.length, offset + 2000);
    for (let index = offset; index < end && matches.size < limit; index += 1) {
      const value = dataset.rows[indices[index]]?.[position];
      if (isMissing(value) || value instanceof Date || typeof value === "object") continue;
      const primitive = value as CategoryValue;
      if (normalized && !String(primitive).toLocaleLowerCase().includes(normalized)) continue;
      matches.set(categoryKey(primitive), primitive);
    }
    if (end < indices.length && matches.size < limit) await nextFrame();
  }

  return [...matches.values()].sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
}
