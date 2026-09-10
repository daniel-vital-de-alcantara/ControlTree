import { afterEach, describe, expect, it, vi } from "vitest";

import { shortcutForEvent, shortcutLabel, treeNavigationTarget } from "./keyboard-shortcuts";
import type { TreeNode } from "./domain";

function keyboard(key: string, options: KeyboardEventInit & { target?: EventTarget | null } = {}) {
  return { key, code: options.code ?? "", metaKey: options.metaKey ?? false, ctrlKey: options.ctrlKey ?? false, shiftKey: options.shiftKey ?? false, altKey: options.altKey ?? false, target: options.target ?? null } as KeyboardEvent;
}

afterEach(() => vi.unstubAllGlobals());

describe("keyboard shortcuts", () => {
  it("uses the correct platform modifier label", () => {
    const shortcut = shortcutForEvent(keyboard("s", { metaKey: true }), "editor")!;
    expect(shortcut.id).toBe("save");
    expect(shortcutLabel(shortcut, true)).toBe("⌘S");
    expect(shortcutLabel(shortcut, false)).toBe("Ctrl+S");
  });

  it("moves through the tree according to its hierarchy", () => {
    const tree: TreeNode = { id: "root", title: "Root", samples: 4, children: [
      { id: "root.1", title: "Left", samples: 2, children: [{ id: "root.1.1", title: "Leaf", samples: 1, children: [] }] },
      { id: "root.2", title: "Right", samples: 2, children: [] },
    ] };
    expect(treeNavigationTarget(tree, "root", "ArrowDown")).toBe("root.1");
    expect(treeNavigationTarget(tree, "root.1", "ArrowRight")).toBe("root.2");
    expect(treeNavigationTarget(tree, "root.2", "ArrowLeft")).toBe("root.1");
    expect(treeNavigationTarget(tree, "root.1.1", "ArrowUp")).toBe("root.1");
  });

  it("matches plain tool numbers without modifiers", () => {
    expect(shortcutForEvent(keyboard("4"), "editor")?.id).toBe("tool-distribution");
    expect(shortcutForEvent(keyboard("4", { ctrlKey: true }), "editor")).toBeUndefined();
  });

  it("distinguishes undo and redo", () => {
    expect(shortcutForEvent(keyboard("z", { ctrlKey: true }), "editor")?.id).toBe("undo");
    expect(shortcutForEvent(keyboard("z", { ctrlKey: true, shiftKey: true }), "editor")?.id).toBe("redo");
  });

  it("does not claim important browser shortcuts", () => {
    for (const key of ["t", "w", "l", "r"]) expect(shortcutForEvent(keyboard(key, { ctrlKey: true }), "editor")).toBeUndefined();
  });

  it("supports both delete keys inside the tree", () => {
    expect(shortcutForEvent(keyboard("Delete"), "tree")?.id).toBe("delete");
    expect(shortcutForEvent(keyboard("Backspace"), "tree")?.id).toBe("delete");
  });

  it("protects typing while still allowing Escape, Save, and Find", () => {
    class FakeElement {
      isContentEditable = false;
      closest(selector: string) { return selector.includes("input") ? this : null; }
    }
    class FakeInput extends FakeElement { disabled = false; readOnly = false; type = "text"; }
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("HTMLInputElement", FakeInput);
    const input = new FakeInput() as unknown as EventTarget;
    expect(shortcutForEvent(keyboard("2", { target: input }), "editor")).toBeUndefined();
    expect(shortcutForEvent(keyboard("z", { ctrlKey: true, target: input }), "editor")).toBeUndefined();
    expect(shortcutForEvent(keyboard("c", { ctrlKey: true, target: input }), "tree")).toBeUndefined();
    expect(shortcutForEvent(keyboard("Escape", { target: input }), "editor")?.id).toBe("escape");
    expect(shortcutForEvent(keyboard("s", { ctrlKey: true, target: input }), "editor")?.id).toBe("save");
    expect(shortcutForEvent(keyboard("f", { ctrlKey: true, target: input }), "editor")?.id).toBe("find");
  });
});
