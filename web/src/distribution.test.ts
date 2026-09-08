import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import { buildHistogram, displayCategories, profileVariable } from "./distribution";

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
});
