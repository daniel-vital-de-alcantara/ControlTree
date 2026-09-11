import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TreeCanvas } from "./TreeCanvas";
import type { TreeNode } from "./domain";

const tree: TreeNode = {
  id: "root", title: "Root", samples: 2, children: [
    { id: "root.1", title: "Left", samples: 1, branchLabel: "left", children: [] },
    { id: "root.2", title: "Right", samples: 1, branchLabel: "right", children: [] },
  ],
};

describe("TreeCanvas keyboard accessibility", () => {
  it("exposes one roving tab stop and tree semantics", () => {
    const markup = renderToStaticMarkup(<TreeCanvas node={tree} selectedNodeId="root.2" keyboardFocusedNodeId="root.2" onSelectNode={() => undefined} onKeyboardFocusNode={() => undefined} />);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(markup).toContain('role="tree"');
    expect(markup.match(/role="treeitem"/g)).toHaveLength(3);
    expect(markup).toContain('aria-selected="true"');
  });

  it("renders the compact layout as one layered tree composite", () => {
    const markup = renderToStaticMarkup(<TreeCanvas node={tree} selectedNodeId="" keyboardFocusedNodeId="root" onSelectNode={() => undefined} layout="compact" />);
    expect(markup).toContain("compact-tree");
    expect(markup.match(/role="treeitem"/g)).toHaveLength(3);
  });
});
