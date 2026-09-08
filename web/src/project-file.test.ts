import { describe, expect, it } from "vitest";

import type { TreeNode } from "./domain";
import { createProject, parseProjectText } from "./project-file";
import { defaultAppearance, defaultNodeFields } from "./tree-settings";

const tree: TreeNode = {
  id: "root",
  title: "All rows",
  samples: 4,
  rowIndices: [0, 1, 2, 3],
  split: { kind: "binary", feature: "age", operator: "<=", value: 30 },
  children: [
    { id: "root.1", title: "Matching rows", samples: 2, rowIndices: [0, 1], children: [] },
    { id: "root.2", title: "Remaining rows", samples: 2, rowIndices: [2, 3], children: [] },
  ],
};

describe("ControlTree project files", () => {
  it("stores rules and settings without storing dataset rows or row membership", () => {
    const project = createProject(tree, "outcome", defaultAppearance, defaultNodeFields, [
      { id: "metric-1", variable: "sales", aggregation: "sum", highlighted: true },
    ]);
    const text = JSON.stringify(project);

    expect(text).not.toContain("rowIndices");
    expect(text).not.toContain("targetLabel");
    expect(project.tree.split).toEqual({ kind: "binary", feature: "age", operator: "<=", value: 30 });
    expect(project.summaries).toEqual([{ variable: "sales", aggregation: "sum", highlighted: true }]);
    expect(project.nodeFields).toEqual(defaultNodeFields);
  });

  it("validates and parses a versioned project", () => {
    const project = createProject(tree, "outcome", defaultAppearance, defaultNodeFields, []);
    expect(parseProjectText(JSON.stringify(project))).toEqual(project);
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseProjectText('{"hello":"world"}')).toThrow("not a ControlTree");
  });

  it("opens older version-one files with the new display defaults", () => {
    const project = createProject(tree, "outcome", defaultAppearance, defaultNodeFields, []);
    const legacy = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    delete legacy.nodeFields;
    const legacyAppearance = legacy.appearance as Record<string, unknown>;
    delete legacyAppearance.backgroundColor;
    delete legacyAppearance.showGrid;

    const parsed = parseProjectText(JSON.stringify(legacy));
    expect(parsed.nodeFields).toEqual(defaultNodeFields);
    expect(parsed.appearance.backgroundColor).toBe(defaultAppearance.backgroundColor);
    expect(parsed.appearance.showGrid).toBe(true);
  });

  it("stores distribution settings without enabling presentation automatically", () => {
    const project = createProject(
      tree,
      "outcome",
      defaultAppearance,
      defaultNodeFields,
      [],
      { variable: "age", binWidth: 10, scale: "percentage" },
    );
    expect(parseProjectText(JSON.stringify(project)).distribution).toEqual({
      variable: "age",
      binWidth: 10,
      scale: "percentage",
    });
    expect(JSON.stringify(project)).not.toContain("showInPresentation");
  });

  it("allows a project without a recommendation target", () => {
    const project = createProject(tree, null, defaultAppearance, defaultNodeFields, []);
    expect(project.recommendationTarget).toBeUndefined();
    expect(parseProjectText(JSON.stringify(project)).recommendationTarget).toBeUndefined();
  });

  it("reads the old target field as an optional recommendation target", () => {
    const project = createProject(tree, null, defaultAppearance, defaultNodeFields, []);
    const legacy = { ...project, target: "outcome" };
    expect(parseProjectText(JSON.stringify(legacy)).recommendationTarget).toBe("outcome");
  });
});
