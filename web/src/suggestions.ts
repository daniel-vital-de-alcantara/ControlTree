import type { DataValue, ParsedDataset } from "./dataset";
import { asNumber, columnPosition, frequencyValues, isMissing, isNumericColumn, observedRowIndices, splitRows } from "./data-engine";
import type { SplitCandidate } from "./domain";

function quantile(sorted: number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sorted[lower] + ((sorted[lower + 1] ?? sorted[lower]) - sorted[lower]) * fraction;
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
}

function categoryKey(value: unknown): string {
  return `${typeof value}:${String(value)}`;
}

function gini(values: Array<DataValue | undefined>): number {
  const observed = values.filter((value) => !isMissing(value));
  if (observed.length === 0) return 0;
  const counts = new Map<string, number>();
  observed.forEach((value) => counts.set(categoryKey(value), (counts.get(categoryKey(value)) ?? 0) + 1));
  return 1 - [...counts.values()].reduce((sum, count) => sum + ((count / observed.length) ** 2), 0);
}

export function calculateSplitSuggestions(
  dataset: ParsedDataset,
  target: string,
  rowIndices?: number[],
  signal?: AbortSignal,
): SplitCandidate[] {
  if (signal?.aborted) throw new DOMException("The calculation was cancelled.", "AbortError");
  const indices = observedRowIndices(dataset, rowIndices);
  if (indices.length < 2) return [];
  const targetPosition = columnPosition(dataset, target);
  const targetValues = indices.map((rowIndex) => dataset.rows[rowIndex]?.[targetPosition]);
  const distinctTargetValues = new Set(targetValues.filter((value) => !isMissing(value)).map(categoryKey));
  const regression = isNumericColumn(dataset, target, indices) && distinctTargetValues.size > 20;
  const minSamplesLeaf = Math.min(20, Math.max(1, Math.floor(indices.length / 10)));
  const parentNumeric = targetValues
    .map((value) => asNumber(value, dataset, target))
    .filter((value): value is number => value !== null);
  const parentScore = regression ? variance(parentNumeric) : gini(targetValues);
  const candidates: Array<Omit<SplitCandidate, "id">> = [];

  for (const feature of dataset.columns.filter((column) => column !== target)) {
    const featurePosition = columnPosition(dataset, feature);
    const featureValues = indices.map((rowIndex) => dataset.rows[rowIndex]?.[featurePosition]);
    const numeric = isNumericColumn(dataset, feature, indices);
    let candidateValues: Array<string | number | boolean>;
    if (numeric) {
      const sorted = featureValues
        .map((value) => asNumber(value, dataset, feature))
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);
      candidateValues = [...new Set(Array.from(
        { length: 20 },
        (_, index) => quantile(sorted, 0.05 + (index * 0.9 / 19)),
      ))];
    } else {
      // Ranking every unique value in identifier-like columns can take minutes.
      // The most frequent values provide useful categorical candidates while
      // keeping the background calculation bounded.
      candidateValues = frequencyValues(featureValues).slice(0, 30);
    }

    for (const value of candidateValues) {
      const operator = numeric ? "<=" as const : "==" as const;
      const [leftRowIndices, rightRowIndices] = splitRows(dataset, indices, feature, operator, value);
      if (leftRowIndices.length < minSamplesLeaf || rightRowIndices.length < minSamplesLeaf) continue;
      const targetNumbers = (branch: number[]) => branch
        .map((rowIndex) => asNumber(dataset.rows[rowIndex]?.[targetPosition], dataset, target))
        .filter((item): item is number => item !== null);
      const targetCategories = (branch: number[]) => branch.map((rowIndex) => dataset.rows[rowIndex]?.[targetPosition]);
      const leftNumbers = regression ? targetNumbers(leftRowIndices) : [];
      const rightNumbers = regression ? targetNumbers(rightRowIndices) : [];
      const weighted = regression
        ? (leftNumbers.length / parentNumeric.length) * variance(leftNumbers)
          + (rightNumbers.length / parentNumeric.length) * variance(rightNumbers)
        : (leftRowIndices.length / indices.length) * gini(targetCategories(leftRowIndices))
          + (rightRowIndices.length / indices.length) * gini(targetCategories(rightRowIndices));
      candidates.push({
        feature,
        operator,
        value,
        gain: parentScore - weighted,
        criterion: regression ? "Variance reduction" : "Gini gain",
        leftCount: leftRowIndices.length,
        rightCount: rightRowIndices.length,
        leftRowIndices,
        rightRowIndices,
      });
    }
  }

  candidates.sort((left, right) => right.gain - left.gain);
  if (signal?.aborted) throw new DOMException("The calculation was cancelled.", "AbortError");
  const featureCounts = new Map<string, number>();
  const selected = candidates.filter((candidate) => {
    const count = featureCounts.get(candidate.feature) ?? 0;
    featureCounts.set(candidate.feature, count + 1);
    return count < 3;
  });
  return selected.map((candidate, index) => ({
    ...candidate,
    id: `${candidate.feature}-${index + 1}`,
  }));
}

export async function fetchSplitSuggestions(
  dataset: ParsedDataset,
  target: string,
  rowIndices?: number[],
  signal?: AbortSignal,
): Promise<SplitCandidate[]> {
  if (signal?.aborted) throw new DOMException("The calculation was cancelled.", "AbortError");
  if (typeof Worker === "undefined") return calculateSplitSuggestions(dataset, target, rowIndices, signal);

  const worker = new Worker(new URL("./suggestions.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const abort = () => {
      worker.terminate();
      reject(new DOMException("The calculation was cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent<{ candidates?: SplitCandidate[]; error?: string }>) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.candidates ?? []);
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error(event.message || "Could not compute split suggestions."));
    };
    worker.postMessage({ dataset, target, rowIndices });
  });
}
