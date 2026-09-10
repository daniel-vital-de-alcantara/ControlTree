import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { evaluateTree, qualityLabel } from "./tree-test";

const dataset: ParsedDataset = {
  fileName: "quality.csv",
  columns: ["group", "amount"],
  rows: [["a", 1], ["a", 2], ["b", 9], ["b", 10]],
};

const tree: TreeNode = {
  id: "root", title: "All rows", samples: 4, rowIndices: [0, 1, 2, 3],
  split: { kind: "binary", feature: "group", operator: "==", value: "a" },
  children: [
    { id: "root.1", title: "A", samples: 2, rowIndices: [0, 1], children: [] },
    { id: "root.2", title: "B", samples: 2, rowIndices: [2, 3], children: [] },
  ],
};

describe("tree quality tests", () => {
  it("reports perfect categorical separation", () => {
    const result = evaluateTree(dataset, tree, "group");
    expect(result.kind).toBe("categorical");
    expect(result.score).toBeCloseTo(100);
    expect(result.splits[0].score).toBeCloseTo(100);
  });

  it("calculates variance reduction for numeric outcomes", () => {
    const result = evaluateTree(dataset, tree, "amount");
    expect(result.kind).toBe("numeric");
    expect(result.score).toBeCloseTo(98.46, 1);
    expect(qualityLabel(result.score)).toBe("Strong");
  });

  it("returns no score when the outcome has no variation", () => {
    const constant = { ...dataset, rows: dataset.rows.map((row) => [row[0], 1]) };
    expect(evaluateTree(constant, tree, "amount").score).toBeNull();
  });
});
