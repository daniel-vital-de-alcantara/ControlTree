import type { ParsedDataset } from "./dataset";
import type { SplitCandidate } from "./domain";

type ApiSuggestion = {
  id: string;
  feature: string;
  operator: "<=" | "==";
  value: number | string | boolean;
  gain: number;
  criterion: string;
  left_count: number;
  right_count: number;
  left_row_indices: number[];
  right_row_indices: number[];
};

export async function fetchSplitSuggestions(
  dataset: ParsedDataset,
  target: string,
  rowIndices?: number[],
  signal?: AbortSignal,
): Promise<SplitCandidate[]> {
  const response = await fetch("/api/suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns: dataset.columns,
      rows: dataset.rows,
      target,
      row_indices: rowIndices,
    }),
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "The split service could not analyze this dataset.");
  }

  const suggestions = await response.json() as ApiSuggestion[];
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    feature: suggestion.feature,
    operator: suggestion.operator,
    value: suggestion.value,
    gain: suggestion.gain,
    criterion: suggestion.criterion,
    leftCount: suggestion.left_count,
    rightCount: suggestion.right_count,
    leftRowIndices: suggestion.left_row_indices,
    rightRowIndices: suggestion.right_row_indices,
  }));
}
