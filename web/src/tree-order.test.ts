import { describe, expect, it } from "vitest";

import { normalizeTable } from "./dataset";
import type { TreeNode } from "./domain";
import { defaultAppearance, type SummaryMetric } from "./tree-settings";
import { moveDisplayedSibling, orderTreeForDisplay } from "./tree-order";

const dataset = normalizeTable([
  ["score"],
  [10],
  [30],
  [20],
], "scores.csv");
const tree: TreeNode = {
  id: "root", title: "Root", samples: 3, rowIndices: [0, 1, 2], children: [
    { id: "root.1", title: "One", samples: 1, rowIndices: [0], children: [] },
    { id: "root.2", title: "Two", samples: 1, rowIndices: [1], children: [] },
    { id: "root.3", title: "Three", samples: 1, rowIndices: [2], children: [] },
  ],
};
const metric: SummaryMetric = { id: "target", variable: "score", aggregation: "average", highlighted: true, target: true };

describe("display branch ordering", () => {
  it("places the highest target metric on the chosen side", () => {
    const highLeft = orderTreeForDisplay(tree, { ...defaultAppearance, branchOrder: "target-high-left" }, dataset, metric);
    const highRight = orderTreeForDisplay(tree, { ...defaultAppearance, branchOrder: "target-high-right" }, dataset, metric);
    expect(highLeft.children.map((node) => node.id)).toEqual(["root.2", "root.3", "root.1"]);
    expect(highRight.children.map((node) => node.id)).toEqual(["root.1", "root.3", "root.2"]);
  });

  it("records a dragged sibling order without changing the analytical tree", () => {
    const moved = moveDisplayedSibling(tree, defaultAppearance, "root.3", "root.1");
    expect(moved.customBranchOrders.root).toEqual(["root.3", "root.2", "root.1"]);
    expect(orderTreeForDisplay(tree, moved).children.map((node) => node.id)).toEqual(["root.3", "root.2", "root.1"]);
    expect(tree.children.map((node) => node.id)).toEqual(["root.1", "root.2", "root.3"]);
  });
});
