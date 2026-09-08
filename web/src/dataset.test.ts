import { describe, expect, it } from "vitest";

import { normalizeTable, summarizeTarget } from "./dataset";

describe("dataset import", () => {
  it("normalizes a header row and pads missing cells", () => {
    const dataset = normalizeTable([
      ["age", "outcome"],
      [31, "yes"],
      [44],
    ], "sample.xlsx");

    expect(dataset.columns).toEqual(["age", "outcome"]);
    expect(dataset.rows[1]).toEqual([44, null]);
  });

  it("rejects duplicate headers", () => {
    expect(() => normalizeTable([
      ["value", "value"],
      [1, 2],
    ], "sample.csv")).toThrow("unique");
  });

  it("summarizes a classification target", () => {
    const dataset = normalizeTable([
      ["id", "outcome"],
      [1, "yes"],
      [2, "no"],
      [3, "yes"],
    ], "sample.csv");

    expect(summarizeTarget(dataset, "outcome")).toEqual({
      label: "67% outcome = yes",
      classCount: 2,
      kind: "categorical",
    });
  });

  it("shows the average for a numeric target", () => {
    const dataset = normalizeTable([
      ["feature", "amount"],
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ], "sample.csv");

    expect(summarizeTarget(dataset, "amount").label).toBe("Avg amount: 20");
    expect(summarizeTarget(dataset, "amount", [0]).label).toBe("Avg amount: 10");
  });
});
