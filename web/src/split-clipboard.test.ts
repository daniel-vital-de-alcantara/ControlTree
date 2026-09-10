import { describe, expect, it } from "vitest";

import { normalizeTable } from "./dataset";
import type { TreeNode } from "./domain";
import { parseCopiedSplits, pasteCopiedSplits, serializeCopiedSplits } from "./split-clipboard";

const source: TreeNode = {
  id: "root", title: "All", samples: 4, rowIndices: [0, 1, 2, 3],
  split: { kind: "binary", feature: "age", operator: "<=", value: 30 },
  children: [
    { id: "root.1", title: "Young", samples: 2, rowIndices: [0, 1], children: [] },
    { id: "root.2", title: "Older", samples: 2, rowIndices: [2, 3], children: [] },
  ],
};

describe("split clipboard", () => {
  it("serializes a portable ControlTree split payload", () => {
    const payload = parseCopiedSplits(serializeCopiedSplits(source, "single"));
    expect(payload.mode).toBe("single");
    expect(payload.tree.split?.kind).toBe("binary");
    expect(payload.tree.split && payload.tree.split.kind !== "random" ? payload.tree.split.feature : undefined).toBe("age");
    expect(payload.tree.children).toHaveLength(2);
  });

  it("rebuilds copied splits from the destination node's rows", () => {
    const dataset = normalizeTable([["age"], [10], [20], [40], [50]], "ages.csv");
    const destination: TreeNode = { id: "root", title: "Destination", samples: 4, rowIndices: [0, 1, 2, 3], children: [] };
    const pasted = pasteCopiedSplits(dataset, destination, "root", parseCopiedSplits(serializeCopiedSplits(source, "subtree")));
    expect(pasted.title).toBe("Destination");
    expect(pasted.children.map((child) => child.samples)).toEqual([2, 2]);
    expect(pasted.children.map((child) => child.title)).toEqual(["Young", "Older"]);
  });

  it("rejects unrelated clipboard text", () => {
    expect(() => parseCopiedSplits("hello")).toThrow("clipboard");
  });

  it("copies random splits between nodes", () => {
    const randomSource: TreeNode = { ...source, split: { kind: "random", percentages: [50, 50], seed: 9 } };
    const dataset = normalizeTable([["age"], [10], [20], [40], [50]], "ages.csv");
    const destination: TreeNode = { id: "root", title: "Destination", samples: 4, rowIndices: [0, 1, 2, 3], children: [] };
    const pasted = pasteCopiedSplits(dataset, destination, "root", parseCopiedSplits(serializeCopiedSplits(randomSource, "single")));
    expect(pasted.split).toEqual(randomSource.split);
    expect(pasted.children.map((child) => child.samples)).toEqual([2, 2]);
  });
});
