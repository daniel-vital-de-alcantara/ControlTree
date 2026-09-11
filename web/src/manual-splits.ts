import type { ParsedDataset } from "./dataset";
import { materializeManualBranches } from "./data-engine";
import type { ManualSplitResult } from "./domain";

export async function requestManualSplit(
  dataset: ParsedDataset,
  rowIndices: number[],
  feature: string,
  values: Array<string | number | boolean>,
  forceCategorical: boolean,
  includeOther: boolean,
  missingDestination?: number | "other" | "exclude",
): Promise<ManualSplitResult> {
  const branches = materializeManualBranches(
    dataset,
    rowIndices,
    feature,
    values,
    forceCategorical,
    includeOther,
    missingDestination,
  );
  return {
    feature,
    definition: {
      kind: "manual",
      feature,
      values,
      forceCategorical,
      includeOther,
      ...(missingDestination !== undefined ? { missingDestination } : {}),
    },
    branches: branches.map((branch) => ({
      label: branch.label,
      count: branch.rowIndices.length,
      rowIndices: branch.rowIndices,
    })),
  };
}
