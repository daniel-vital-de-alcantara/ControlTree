import { describe, expect, it } from "vitest";

import type { TreeNode } from "./domain";
import { presentationTree } from "./presentation";

describe("presentation state", () => {
  it("removes row membership from every node", () => {
    const tree: TreeNode = {
      id: "root",
      title: "All rows",
      samples: 3,
      rowIndices: [0, 1, 2],
      children: [{
        id: "root.1",
        title: "Branch 1",
        samples: 2,
        rowIndices: [0, 2],
        children: [],
      }],
    };

    const safeTree = presentationTree(tree);
    expect(safeTree.rowIndices).toBeUndefined();
    expect(safeTree.children[0].rowIndices).toBeUndefined();
    expect(safeTree.samples).toBe(3);
  });
});
