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
): Promise<ManualSplitResult> {
  const branches = materializeManualBranches(
    dataset,
    rowIndices,
    feature,
    values,
    forceCategorical,
    includeOther,
  );
  return {
    feature,
    definition: {
      kind: "manual",
      feature,
      values,
      forceCategorical,
      includeOther,
    },
    branches: branches.map((branch) => ({
      label: branch.label,
      count: branch.rowIndices.length,
      rowIndices: branch.rowIndices,
    })),
  };
}
