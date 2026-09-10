import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import { buildNodeSummaries, isNumericVariable, summarizeMetric } from "./tree-settings";
import type { TreeNode } from "./domain";

const dataset: ParsedDataset = {
  fileName: "sample.csv",
  columns: ["amount", "group"],
  rows: [[10, "a"], [20, "a"], [null, "b"]],
};

describe("tree summaries", () => {
  it("detects numeric variables and calculates their average", () => {
    expect(isNumericVariable(dataset, "amount")).toBe(true);
    expect(summarizeMetric(dataset, [0, 1, 2], {
      id: "average",
      variable: "amount",
      aggregation: "average",
      highlighted: false,
    })).toBe("15");
  });

  it("honors categorical and numeric type overrides", () => {
    const categorical = { ...dataset, variableTypes: { amount: "categorical" as const } };
    expect(isNumericVariable(categorical, "amount")).toBe(false);

    const numeric = {
      fileName: "comma.csv",
      columns: ["amount"],
      rows: [["12,5"], ["20,5"]],
      numberFormats: { amount: "comma" as const },
      variableTypes: { amount: "numeric" as const },
    };
    expect(isNumericVariable(numeric, "amount")).toBe(true);
    expect(summarizeMetric(numeric, undefined, {
      id: "metric-comma",
      variable: "amount",
      aggregation: "average",
      highlighted: false,
    })).toBe("16.5");
  });

  it("counts distinct and missing values for each node subset", () => {
    expect(summarizeMetric(dataset, [0, 2], {
      id: "distinct",
      variable: "group",
      aggregation: "distinct",
      highlighted: false,
    })).toBe("2");
    expect(summarizeMetric(dataset, [0, 1, 2], {
      id: "missing",
      variable: "amount",
      aggregation: "missing",
      highlighted: false,
    })).toBe("1");
    expect(summarizeMetric(dataset, [0, 1, 2], {
      id: "count",
      variable: "amount",
      aggregation: "count",
      highlighted: false,
    })).toBe("2");
  });

  it("preserves each metric's independent highlight setting", () => {
    const tree: TreeNode = { id: "root", title: "All rows", samples: 3, rowIndices: [0, 1, 2], children: [] };
    const summaries = buildNodeSummaries(tree, dataset, [
      { id: "one", variable: "amount", aggregation: "average", highlighted: true },
      { id: "two", variable: "group", aggregation: "distinct", highlighted: false },
      { id: "three", variable: "amount", aggregation: "missing", highlighted: true },
    ]);
    expect(summaries.root.map((summary) => summary.highlighted)).toEqual([true, false, true]);
  });

  it("keeps the project target highlighted after every ordinary metric", () => {
    const tree: TreeNode = { id: "root", title: "All rows", samples: 3, rowIndices: [0, 1, 2], children: [] };
    const summaries = buildNodeSummaries(tree, dataset, [
      { id: "one", variable: "amount", aggregation: "average", highlighted: false },
      { id: "project-target", variable: "group", aggregation: "mode", highlighted: true, target: true },
    ]);

    expect(summaries.root.map((summary) => summary.id)).toEqual(["one", "project-target"]);
    expect(summaries.root.at(-1)).toMatchObject({ label: "Most common group", highlighted: true });
  });

  it("formats numeric metrics and categorical modes as percentages", () => {
    expect(summarizeMetric(dataset, [0, 1], {
      id: "percentage",
      variable: "amount",
      aggregation: "average",
      highlighted: false,
      format: "percentage",
    })).toBe("1,500%");
    expect(summarizeMetric(dataset, [0, 1, 2], {
      id: "mode-percentage",
      variable: "group",
      aggregation: "mode",
      highlighted: false,
      format: "percentage",
    })).toBe("66.7%");
  });
});
