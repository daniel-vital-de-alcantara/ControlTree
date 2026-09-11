import type { TreeNode } from "./domain";

export type ShortcutScope = "editor" | "tree" | "presentation";
export type ShortcutGroup = "Tools" | "Tree editing" | "Navigation" | "View / Zoom" | "Project / File" | "Presentation Mode";

export type ShortcutId =
  | "tool-target" | "tool-metrics" | "tool-split" | "tool-distribution" | "tool-test"
  | "tool-variables" | "tool-tree" | "tool-present" | "tool-guide" | "tool-more"
  | "undo" | "redo" | "copy" | "cut" | "paste" | "select-all" | "save" | "find"
  | "delete" | "escape" | "activate" | "context-menu" | "region-next" | "region-previous" | "move-items"
  | "zoom-in" | "zoom-out" | "fit" | "reset-view";

export type ShortcutDefinition = {
  id: ShortcutId;
  title: string;
  group: ShortcutGroup;
  key: string;
  alternateKeys?: string[];
  code?: string;
  modifiers?: "primary" | "primary-shift" | "shift";
  scopes: ShortcutScope[];
  allowInEditable?: boolean;
  displayOnly?: boolean;
};

export const SHORTCUTS: ShortcutDefinition[] = [
  { id: "tool-target", title: "Target variable", group: "Tools", key: "1", scopes: ["editor"] },
  { id: "tool-metrics", title: "Metrics", group: "Tools", key: "2", scopes: ["editor"] },
  { id: "tool-split", title: "Split", group: "Tools", key: "3", scopes: ["editor"] },
  { id: "tool-distribution", title: "Distribution", group: "Tools", key: "4", scopes: ["editor"] },
  { id: "tool-test", title: "Test tree", group: "Tools", key: "5", scopes: ["editor"] },
  { id: "tool-variables", title: "Variable types", group: "Tools", key: "6", scopes: ["editor"] },
  { id: "tool-tree", title: "Tree settings", group: "Tools", key: "7", scopes: ["editor"] },
  { id: "tool-present", title: "Present tree", group: "Tools", key: "8", scopes: ["editor"] },
  { id: "tool-guide", title: "Guide", group: "Tools", key: "9", scopes: ["editor"] },
  { id: "tool-more", title: "More actions", group: "Tools", key: "0", scopes: ["editor"] },
  { id: "undo", title: "Undo tree edit", group: "Tree editing", key: "z", modifiers: "primary", scopes: ["editor"] },
  { id: "redo", title: "Redo tree edit", group: "Tree editing", key: "z", modifiers: "primary-shift", scopes: ["editor"] },
  { id: "copy", title: "Copy selected split subtree", group: "Tree editing", key: "c", modifiers: "primary", scopes: ["tree"] },
  { id: "cut", title: "Cut selected split subtree", group: "Tree editing", key: "x", modifiers: "primary", scopes: ["tree"] },
  { id: "paste", title: "Paste split at selected node", group: "Tree editing", key: "v", modifiers: "primary", scopes: ["tree"] },
  { id: "select-all", title: "Select the whole tree (root)", group: "Tree editing", key: "a", modifiers: "primary", scopes: ["tree"] },
  { id: "delete", title: "Remove the selected split and descendants", group: "Tree editing", key: "Delete", alternateKeys: ["Backspace"], scopes: ["tree"] },
  { id: "activate", title: "Open the focused node", group: "Tree editing", key: "Enter", scopes: ["tree"] },
  { id: "context-menu", title: "Open node actions", group: "Tree editing", key: "F10", modifiers: "shift", scopes: ["tree"] },
  { id: "escape", title: "Cancel, close, or deselect", group: "Navigation", key: "Escape", scopes: ["editor", "tree", "presentation"], allowInEditable: true },
  { id: "region-next", title: "Next application region", group: "Navigation", key: "Tab", scopes: ["editor"] },
  { id: "region-previous", title: "Previous application region", group: "Navigation", key: "Tab", modifiers: "shift", scopes: ["editor"] },
  { id: "move-items", title: "Move within the focused region or tree", group: "Navigation", key: "← ↑ ↓ →", scopes: ["editor"], displayOnly: true },
  { id: "find", title: "Find a node", group: "Navigation", key: "f", modifiers: "primary", scopes: ["editor"], allowInEditable: true },
  { id: "zoom-in", title: "Zoom in", group: "View / Zoom", key: "+", code: "Equal", scopes: ["editor", "presentation"] },
  { id: "zoom-out", title: "Zoom out", group: "View / Zoom", key: "-", code: "Minus", scopes: ["editor", "presentation"] },
  { id: "fit", title: "Fit tree to view", group: "View / Zoom", key: "f", scopes: ["editor", "presentation"] },
  { id: "reset-view", title: "Reset the canvas view", group: "View / Zoom", key: "r", scopes: ["editor", "presentation"] },
  { id: "save", title: "Save project", group: "Project / File", key: "s", modifiers: "primary", scopes: ["editor"], allowInEditable: true },
];

export function isApplePlatform(platform = navigator.platform): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  const control = target.closest<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select, [role='textbox'], [role='searchbox'], [data-editable='true']");
  if (!control || control.disabled || ("readOnly" in control && control.readOnly)) return false;
  if (control instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit", "reset"].includes(control.type)) return false;
  return true;
}

export function treeNavigationTarget(root: TreeNode, nodeId: string, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"): string {
  const path: TreeNode[] = [];
  function visit(node: TreeNode): boolean {
    path.push(node);
    if (node.id === nodeId) return true;
    for (const child of node.children) if (visit(child)) return true;
    path.pop();
    return false;
  }
  if (!visit(root)) return root.id;
  const current = path.at(-1)!;
  const parent = path.at(-2);
  if (key === "ArrowUp") return parent?.id ?? current.id;
  if (key === "ArrowDown") return current.children[0]?.id ?? current.id;
  if (!parent) return current.id;
  const index = parent.children.findIndex((child) => child.id === current.id);
  if (key === "ArrowLeft") return parent.children[index - 1]?.id ?? parent.id;
  return parent.children[index + 1]?.id ?? current.children[0]?.id ?? current.id;
}

export function shortcutLabel(shortcut: ShortcutDefinition, apple = isApplePlatform()): string {
  const primary = apple ? "⌘" : "Ctrl+";
  const shift = apple ? "⇧" : "Shift+";
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  if (shortcut.modifiers === "primary-shift") return `${primary}${shift}${key}`;
  if (shortcut.modifiers === "primary") return `${primary}${key}`;
  if (shortcut.modifiers === "shift") return `${shift}${key}`;
  if (shortcut.alternateKeys?.length) return [key, ...shortcut.alternateKeys].join(" / ");
  return key;
}

export function shortcutForEvent(event: KeyboardEvent, scope: ShortcutScope): ShortcutDefinition | undefined {
  const editable = isEditableTarget(event.target);
  return SHORTCUTS.find((shortcut) => {
    if (shortcut.displayOnly) return false;
    if (!shortcut.scopes.includes(scope) && !(scope === "tree" && shortcut.scopes.includes("editor"))) return false;
    if (editable && !shortcut.allowInEditable) return false;
    const primary = event.metaKey || event.ctrlKey;
    if (shortcut.modifiers === "primary" && (!primary || event.shiftKey)) return false;
    if (shortcut.modifiers === "primary-shift" && (!primary || !event.shiftKey)) return false;
    if (shortcut.modifiers === "shift" && (!event.shiftKey || primary || event.altKey)) return false;
    if (!shortcut.modifiers && (primary || event.altKey || event.shiftKey && shortcut.key !== "+")) return false;
    if (shortcut.code && event.code === shortcut.code) return true;
    return [shortcut.key, ...(shortcut.alternateKeys ?? [])].some((key) => event.key.toLocaleLowerCase() === key.toLocaleLowerCase());
  });
}

export function shortcutsByGroup(scope: ShortcutScope = "editor"): Array<{ group: ShortcutGroup; shortcuts: ShortcutDefinition[] }> {
  const order: ShortcutGroup[] = ["Tools", "Tree editing", "Navigation", "View / Zoom", "Project / File", "Presentation Mode"];
  return order.map((group) => ({ group, shortcuts: SHORTCUTS.filter((shortcut) => shortcut.group === group && (shortcut.scopes.includes(scope) || shortcut.scopes.includes("tree"))) })).filter((section) => section.shortcuts.length);
}
