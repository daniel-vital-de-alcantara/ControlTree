import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import { buildHistogram, createDistributionSnapshot, createScatterSnapshot, displayCategories, profileVariable, takeExampleRows } from "./distribution";
import type { TreeNode } from "./domain";

const dataset: ParsedDataset = {
  fileName: "profile.csv",
  columns: ["amount", "group"],
  rows: [[10, "a"], [20, "a"], [30, "b"], [null, null]],
};

describe("selected-node distributions", () => {
  it("calculates numeric statistics for only the selected rows", () => {
    const profile = profileVariable(dataset, "amount", [0, 1, 3]);
    expect(profile.numeric).toBe(true);
    expect(profile.statistics).toMatchObject({
      count: 2,
      missing: 1,
      distinct: 2,
      minimum: 10,
      maximum: 20,
      average: 15,
      median: 15,
      variance: 25,
      standardDeviation: 5,
    });
  });

  it("builds clean boundaries using an exact bin width", () => {
    const histogram = buildHistogram([3, 9, 10, 19, 20], 10);
    expect(histogram).toHaveLength(3);
    expect(histogram.map((bin) => [bin.start, bin.end])).toEqual([[0, 10], [10, 20], [20, 30]]);
    expect(histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(5);
  });

  it("groups long categorical tails into Other", () => {
    const categories = Array.from({ length: 14 }, (_, index) => ({ label: String(index), count: 1 }));
    const visible = displayCategories(categories, 12);
    expect(visible).toHaveLength(13);
    expect(visible.at(-1)).toEqual({ label: "Other (2)", count: 2 });
  });

  it("caps very wide histograms with a final overflow bucket", () => {
    const histogram = buildHistogram(Array.from({ length: 100 }, (_, index) => index), 1, 8);
    expect(histogram).toHaveLength(8);
    expect(histogram.at(-1)?.overflow).toBe(true);
    expect(histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(100);
  });

  it("keeps empty histogram bins at zero", () => {
    expect(buildHistogram([0, 20], 10).map((bin) => bin.count)).toEqual([1, 0, 1]);
  });

  it("calculates average target values for each histogram bucket", () => {
    const comparison: ParsedDataset = { fileName: "comparison.csv", columns: ["x", "target"], rows: [[1, 10], [2, 20], [11, 40], [12, 60]] };
    const node: TreeNode = { id: "root", title: "All rows", samples: 4, rowIndices: [0, 1, 2, 3], children: [] };
    const snapshot = createDistributionSnapshot(comparison, node, { variable: "x", binWidth: 10, scale: "count" }, "target");
    expect(snapshot.targetComparison).toBe(true);
    expect(snapshot.histogram.map((bin) => bin.targetAverage)).toEqual([15, 50]);
  });

  it("reports scatter exclusions and produces repeatable examples", () => {
    const comparison: ParsedDataset = { fileName: "comparison.csv", columns: ["x", "y"], rows: [[1, 2], [10, 20], [null, 3]] };
    const node: TreeNode = { id: "root", title: "All rows", samples: 3, rowIndices: [0, 1, 2], children: [] };
    const scatter = createScatterSnapshot(comparison, node, "x", "y", { xMin: 5, xMax: null, yMin: null, yMax: null });
    expect(scatter.excluded).toBe(2);
    expect(takeExampleRows(comparison, [0, 1, 2], ["x"], 7)).toEqual(takeExampleRows(comparison, [0, 1, 2], ["x"], 7));
  });

  it("shows numeric-looking codes as categories when overridden", () => {
    const overridden = {
      ...dataset,
      variableTypes: { amount: "categorical" as const },
    };

    const profile = profileVariable(overridden, "amount");
    expect(profile.numeric).toBe(false);
    expect(profile.categories.map((category) => category.label)).toEqual(["10", "20", "30"]);
  });
});
