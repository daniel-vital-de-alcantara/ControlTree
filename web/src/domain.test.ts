import { describe, expect, it } from "vitest";

import { applyManualSplit, applySplit, describeRule, renameTreeNode, type SplitCandidate, type TreeNode } from "./domain";

const candidate: SplitCandidate = {
  id: "fare-26",
  feature: "fare",
  operator: "<=",
  value: 26,
  gain: 0.108,
  leftCount: 547,
  rightCount: 344,
  leftRowIndices: [0, 1],
  rightRowIndices: [2],
};

const root: TreeNode = {
  id: "root",
  title: "All passengers",
  samples: 891,
  children: [],
};

describe("tree domain", () => {
  it("formats a split using the Python package vocabulary", () => {
    expect(describeRule(candidate)).toBe("fare <= 26");
  });

  it("creates two branches without mutating the original node", () => {
    const next = applySplit(root, "root", candidate);

    expect(root.children).toHaveLength(0);
    expect(next.children).toHaveLength(2);
    expect(next.children.map((node) => node.samples)).toEqual([547, 344]);
    expect(next.children.map((node) => node.rowIndices)).toEqual([[0, 1], [2]]);
    expect(next.split).toEqual({ kind: "binary", feature: "fare", operator: "<=", value: 26 });
  });

  it("creates an ordered multiway manual split", () => {
    const next = applyManualSplit(root, "root", {
      feature: "age",
      definition: {
        kind: "manual",
        feature: "age",
        values: [25, 50],
        forceCategorical: false,
        includeOther: true,
      },
      branches: [
        { label: "<=25", count: 2, rowIndices: [0, 1] },
        { label: "(25, 50]", count: 1, rowIndices: [2] },
        { label: ">50", count: 1, rowIndices: [3] },
      ],
    });

    expect(next.children.map((node) => node.branchLabel)).toEqual(["<=25", "(25, 50]", ">50"]);
    expect(next.children).toHaveLength(3);
    expect(next.split?.kind).toBe("manual");
  });

  it("renames one node without mutating the original tree", () => {
    const splitTree = applySplit(root, "root", candidate);
    const renamed = renameTreeNode(splitTree, "root.1", "Low fare passengers");

    expect(renamed.children[0].title).toBe("Low fare passengers");
    expect(splitTree.children[0].title).toBe("Matching rows");
    expect(renamed.children[1].title).toBe("Remaining rows");
  });
});
