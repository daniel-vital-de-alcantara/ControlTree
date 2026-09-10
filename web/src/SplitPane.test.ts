import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import type { SplitCandidate, TreeNode } from "./domain";
import { candidateMatchesCurrentSplit, rankedSplitFeatures } from "./SplitPane";

const dataset: ParsedDataset = {
  fileName: "sample.csv",
  columns: ["age", "segment", "income", "target"],
  rows: [],
};

const candidates: SplitCandidate[] = [
  { id: "segment-1", feature: "segment", operator: "==", value: "a", gain: .1, leftCount: 4, rightCount: 6 },
  { id: "age-1", feature: "age", operator: "<=", value: 30, gain: .3, leftCount: 5, rightCount: 5 },
  { id: "age-2", feature: "age", operator: "<=", value: 40, gain: .2, leftCount: 7, rightCount: 3 },
];

describe("variable-first split workflow", () => {
  it("orders variables by their best recommendation and leaves unscored variables last", () => {
    expect(rankedSplitFeatures(dataset, "target", candidates)).toEqual([
      { feature: "age", score: .3, count: 2 },
      { feature: "segment", score: .1, count: 1 },
      { feature: "income", score: undefined, count: 0 },
      { feature: "target", score: undefined, count: 0 },
    ]);
  });

  it("recognizes the recommendation used by an existing binary split", () => {
    const node: TreeNode = {
      id: "root",
      title: "All rows",
      samples: 10,
      split: { kind: "binary", feature: "age", operator: "<=", value: 30 },
      children: [],
    };
    expect(candidateMatchesCurrentSplit(candidates[1], node)).toBe(true);
    expect(candidateMatchesCurrentSplit(candidates[2], node)).toBe(false);
  });
});
