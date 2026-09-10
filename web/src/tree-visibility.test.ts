import { describe, expect, it } from "vitest";

import type { TreeNode } from "./domain";
import { visibleTree } from "./tree-visibility";

const tree: TreeNode = {
  id: "root", title: "Root", samples: 4, children: [
    { id: "root.1", title: "Left", samples: 2, children: [{ id: "root.1.1", title: "Leaf", samples: 1, children: [] }] },
    { id: "root.2", title: "Right", samples: 2, children: [] },
  ],
};

describe("tree viewing scope", () => {
  it("focuses the visible tree on a selected node", () => {
    expect(visibleTree(tree, "root.1", []).id).toBe("root.1");
  });

  it("temporarily collapses descendants without changing the source tree", () => {
    const visible = visibleTree(tree, null, ["root.1"]);
    expect(visible.children[0].children).toEqual([]);
    expect(tree.children[0].children).toHaveLength(1);
  });
});
