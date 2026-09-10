import { describe, expect, it } from "vitest";

import type { TreeNode } from "./domain";
import { createProject, parseProjectText, projectFingerprint } from "./project-file";
import { defaultAppearance, defaultNodeFields } from "./tree-settings";
import { defaultTargetSettings } from "./target-settings";

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
    expect(project.tree.children[0].title).toBe("Matching rows");
    expect(project.summaries).toEqual([{ variable: "sales", aggregation: "sum", highlighted: true }]);
    expect(project.nodeFields).toEqual(defaultNodeFields);
    expect(project.targetSettings).toEqual(defaultTargetSettings);
  });

  it("validates and parses a versioned project", () => {
    const project = createProject(tree, "outcome", defaultAppearance, defaultNodeFields, []);
    expect(parseProjectText(JSON.stringify(project))).toEqual(project);
  });

  it("preserves random and percentile split definitions", () => {
    const randomTree: TreeNode = { ...tree, split: { kind: "random", percentages: [70, 20, 10], seed: 123 } };
    const percentileTree: TreeNode = { ...tree, split: { kind: "percentile", feature: "age", buckets: 2 } };
    expect(parseProjectText(JSON.stringify(createProject(randomTree, null, defaultAppearance, defaultNodeFields, []))).tree.split).toEqual(randomTree.split);
    expect(parseProjectText(JSON.stringify(createProject(percentileTree, null, defaultAppearance, defaultNodeFields, []))).tree.split).toEqual(percentileTree.split);
  });

  it("preserves custom metric labels and display formats", () => {
    const fields = { ...defaultNodeFields, rowCountFormat: "percent_parent" as const };
    const project = createProject(tree, "outcome", defaultAppearance, fields, [
      {
        id: "metric-1",
        variable: "sales",
        aggregation: "sum",
        highlighted: true,
        label: "Exposure share",
        format: "percent_root",
      },
      {
        id: "metric-2",
        variable: "sales",
        aggregation: "sum",
        highlighted: false,
        format: "compact",
      },
    ]);
    const restored = parseProjectText(JSON.stringify(project));

    expect(restored.nodeFields.rowCountFormat).toBe("percent_parent");
    expect(restored.summaries).toEqual([
      { variable: "sales", aggregation: "sum", highlighted: true, label: "Exposure share", format: "percent_root" },
      { variable: "sales", aggregation: "sum", highlighted: false, format: "compact" },
    ]);
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseProjectText('{"hello":"world"}')).toThrow("not a ControlTree");
  });

  it("opens older version-one files with the new display defaults", () => {
    const project = createProject(tree, "outcome", defaultAppearance, defaultNodeFields, []);
    const legacy = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    delete legacy.nodeFields;
    delete legacy.targetSettings;
    const legacyAppearance = legacy.appearance as Record<string, unknown>;
    delete legacyAppearance.backgroundColor;
    delete legacyAppearance.showGrid;

    const parsed = parseProjectText(JSON.stringify(legacy));
    expect(parsed.nodeFields).toEqual(defaultNodeFields);
    expect(parsed.appearance.backgroundColor).toBe(defaultAppearance.backgroundColor);
    expect(parsed.appearance.showGrid).toBe(true);
    expect(parsed.targetSettings).toEqual(defaultTargetSettings);
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

  it("stores variable type overrides without storing data", () => {
    const project = createProject(
      tree,
      "outcome",
      defaultAppearance,
      defaultNodeFields,
      [],
      null,
      { account: "categorical", revenue: "numeric" },
    );

    expect(parseProjectText(JSON.stringify(project)).variableTypes).toEqual({
      account: "categorical",
      revenue: "numeric",
    });
  });

  it("stores only lightweight source metadata and serializes identical settings consistently", () => {
    const project = createProject(
      tree,
      "outcome",
      defaultAppearance,
      defaultNodeFields,
      [],
      null,
      {},
      "customers.csv",
      12345,
      1700000000000,
    );
    const restored = parseProjectText(JSON.stringify(project));

    expect(restored.sourceFileName).toBe("customers.csv");
    expect(restored.sourceFileSize).toBe(12345);
    expect(restored.sourceFileLastModified).toBe(1700000000000);
    expect(projectFingerprint(restored)).toBe(projectFingerprint(project));
    expect(JSON.stringify(project)).not.toContain("rowIndices");
  });

  it("stores the ten most recent unique node names", () => {
    const names = ["Watch", "Review", "watch", "Escalate", "Approve", "Hold", "Close", "Open", "Refer", "Investigate", "Monitor", "Archive"];
    const project = createProject(
      tree,
      null,
      defaultAppearance,
      defaultNodeFields,
      [],
      null,
      {},
      undefined,
      undefined,
      undefined,
      defaultTargetSettings,
      names,
    );
    const restored = parseProjectText(JSON.stringify(project));

    expect(restored.nodeNameHistory).toHaveLength(10);
    expect(restored.nodeNameHistory?.slice(0, 3)).toEqual(["Watch", "Review", "Escalate"]);
  });
});
