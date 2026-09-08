import type { ParsedDataset } from "./dataset";
import type { ManualSplitResult } from "./domain";

type ApiManualSplit = {
  feature: string;
  branches: Array<{
    label: string;
    count: number;
    row_indices: number[];
  }>;
};

export async function requestManualSplit(
  dataset: ParsedDataset,
  rowIndices: number[],
  feature: string,
  values: Array<string | number | boolean>,
  forceCategorical: boolean,
  includeOther: boolean,
): Promise<ManualSplitResult> {
  const response = await fetch("/api/manual-split", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      columns: dataset.columns,
      rows: dataset.rows,
      row_indices: rowIndices,
      feature,
      values,
      force_categorical: forceCategorical,
      include_other: includeOther,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "The manual split could not be applied.");
  }

  const result = await response.json() as ApiManualSplit;
  return {
    feature: result.feature,
    definition: {
      kind: "manual",
      feature,
      values,
      forceCategorical,
      includeOther,
    },
    branches: result.branches.map((branch) => ({
      label: branch.label,
      count: branch.count,
      rowIndices: branch.row_indices,
    })),
  };
}
