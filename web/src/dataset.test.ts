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

  it("recognizes comma-decimal and dot-decimal columns", () => {
    const dataset = normalizeTable([
      ["european", "international"],
      ["1.234,50", "1,234.50"],
      ["12,75", "12.75"],
    ], "numbers.csv");

    expect(dataset.rows).toEqual([[1234.5, 1234.5], [12.75, 12.75]]);
    expect(dataset.inferredTypes).toEqual({ european: "numeric", international: "numeric" });
    expect(dataset.numberFormats).toEqual({ european: "comma", international: "dot" });
  });

  it("keeps identifiers with leading zeros categorical", () => {
    const dataset = normalizeTable([
      ["account"],
      ["00123"],
      ["00456"],
    ], "accounts.csv");

    expect(dataset.inferredTypes?.account).toBe("categorical");
    expect(dataset.rows[0][0]).toBe("00123");
  });
});
