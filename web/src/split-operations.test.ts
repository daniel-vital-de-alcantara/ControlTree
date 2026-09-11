import { describe, expect, it } from "vitest";

import { normalizeTable } from "./dataset";
import type { TreeNode } from "./domain";
import { applyPreparedSplit, removeNodeSplit } from "./split-operations";

const dataset = normalizeTable([
  ["age", "income"],
  [20, 10],
  [30, 30],
  [40, 20],
  [50, 40],
], "people.csv");

const tree: TreeNode = {
  id: "root",
  title: "All rows",
  samples: 4,
  rowIndices: [0, 1, 2, 3],
  split: { kind: "binary", feature: "age", operator: "<=", value: 35 },
  children: [
    { id: "root.1", title: "Young", samples: 2, rowIndices: [0, 1], children: [] },
    { id: "root.2", title: "Older", samples: 2, rowIndices: [2, 3], children: [] },
  ],
};

const incomeSplit = {
  definition: { kind: "binary" as const, feature: "income", operator: "<=" as const, value: 25 },
  branches: [
    { label: "income <= 25", count: 2, rowIndices: [0, 2] },
    { label: "not (income <= 25)", count: 2, rowIndices: [1, 3] },
  ],
};

describe("existing split operations", () => {
  it("replaces a split and removes its previous descendants", () => {
    const next = applyPreparedSplit(tree, "root", incomeSplit, "replace", dataset);
    expect(next.split?.kind === "binary" ? next.split.feature : undefined).toBe("income");
    expect(next.children).toHaveLength(2);
    expect(next.children.every((child) => child.children.length === 0)).toBe(true);
  });

  it("preserves existing descendant splits by row overlap when replacing a parent split", () => {
    const withDescendants: TreeNode = {
      ...tree,
      children: [
        tree.children[0],
        {
          ...tree.children[1],
          split: { kind: "binary", feature: "income", operator: "<=", value: 25 },
          children: [
            { id: "root.2.1", title: "Low", samples: 1, rowIndices: [2], children: [] },
            { id: "root.2.2", title: "High", samples: 1, rowIndices: [3], children: [] },
          ],
        },
      ],
    };
    const replacement = {
      definition: { kind: "binary" as const, feature: "age", operator: "<=" as const, value: 25 },
      branches: [
        { label: "age <= 25", count: 1, rowIndices: [0] },
        { label: "not (age <= 25)", count: 3, rowIndices: [1, 2, 3] },
      ],
    };
    const next = applyPreparedSplit(withDescendants, "root", replacement, "replace", dataset);
    expect(next.children[1].split).toEqual(withDescendants.children[1].split);
    expect(next.children[1].children.map((child) => child.samples)).toEqual([1, 2]);
  });

  it("inserts a split above the current split and reapplies it to each new child", () => {
    const next = applyPreparedSplit(tree, "root", incomeSplit, "insert", dataset);
    expect(next.split?.kind === "binary" ? next.split.feature : undefined).toBe("income");
    expect(next.children.map((child) => child.split && child.split.kind !== "random" ? child.split.feature : undefined)).toEqual(["age", "age"]);
    expect(next.children.every((child) => child.children.length === 2)).toBe(true);
  });

  it("keeps an inserted split usable when a reapplied branch is empty", () => {
    const oneSided = {
      definition: { kind: "binary" as const, feature: "income", operator: "<=" as const, value: 5 },
      branches: [
        { label: "income <= 5", count: 0, rowIndices: [] },
        { label: "not (income <= 5)", count: 4, rowIndices: [0, 1, 2, 3] },
      ],
    };
    const next = applyPreparedSplit(tree, "root", oneSided, "insert", dataset);
    expect(next.children.map((child) => child.samples)).toEqual([0, 4]);
    expect(next.children[0].children).toHaveLength(2);
    expect(next.children[0].children.every((child) => child.samples === 0)).toBe(true);
  });

  it("removes a node split and all descendants", () => {
    const next = removeNodeSplit(tree, "root");
    expect(next.split).toBeUndefined();
    expect(next.children).toEqual([]);
  });
});
