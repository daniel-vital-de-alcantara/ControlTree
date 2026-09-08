import { describe, expect, it, vi } from "vitest";

import { normalizeTable } from "./dataset";
import { requestManualSplit } from "./manual-splits";
import { replayProject } from "./replay";
import { fetchSplitSuggestions } from "./suggestions";
import { defaultAppearance, defaultNodeFields } from "./tree-settings";

describe("private browser calculation engine", () => {
  it("ranks classification splits without making a network request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled"));
    const dataset = normalizeTable([
      ["age", "group", "outcome"],
      [18, "a", 0],
      [20, "a", 0],
      [22, "a", 0],
      [48, "b", 1],
      [51, "b", 1],
      [55, "b", 1],
    ], "private.csv");

    const suggestions = await fetchSplitSuggestions(dataset, "outcome");

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].criterion).toBe("Gini gain");
    expect(suggestions[0].leftCount + suggestions[0].rightCount).toBe(6);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uses variance reduction for continuous targets", async () => {
    const dataset = normalizeTable([
      ["day", "period", "revenue"],
      ...Array.from({ length: 30 }, (_, index) => [
        index,
        index < 15 ? "early" : "late",
        index * 3,
      ]),
    ], "revenue.csv");

    const suggestions = await fetchSplitSuggestions(dataset, "revenue");

    expect(suggestions[0].criterion).toBe("Variance reduction");
  });

  it("creates ordered numeric branches and keeps missing values separate", async () => {
    const dataset = normalizeTable([
      ["age"],
      [18],
      [24],
      [35],
      [45],
      [67],
      [null],
    ], "ages.csv");

    const split = await requestManualSplit(dataset, [0, 1, 2, 3, 4, 5], "age", [30, 50], false, true);

    expect(split.branches.map((branch) => branch.label)).toEqual([
      "<=30",
      "(30, 50]",
      ">50",
      "Other / missing",
    ]);
    expect(split.branches.map((branch) => branch.count)).toEqual([2, 2, 1, 1]);
  });

  it("replays a saved tree entirely in the browser", async () => {
    const dataset = normalizeTable([
      ["age", "outcome"],
      [20, 10],
      [29, 20],
      [35, 30],
      [51, 40],
    ], "new-version.csv");
    const tree = await replayProject(dataset, {
      format: "controltree",
      version: 1,
      appearance: defaultAppearance,
      nodeFields: defaultNodeFields,
      summaries: [],
      tree: {
        split: { kind: "binary", feature: "age", operator: "<=", value: 30 },
        children: [{ children: [] }, { children: [] }],
      },
    });

    expect(tree.children.map((child) => child.samples)).toEqual([2, 2]);
    expect(tree.children[0].rowIndices).toEqual([0, 1]);
  });
});
