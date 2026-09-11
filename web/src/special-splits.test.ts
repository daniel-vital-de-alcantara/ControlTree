import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import { materializeSplit } from "./data-engine";

const dataset: ParsedDataset = {
  fileName: "special.csv",
  columns: ["value"],
  rows: Array.from({ length: 100 }, (_, index) => [index]),
};

describe("special splits", () => {
  it("creates stable random groups with the requested proportions", () => {
    const definition = { kind: "random" as const, percentages: [80, 20], seed: 42 };
    const first = materializeSplit(dataset, dataset.rows.map((_, index) => index), definition);
    const second = materializeSplit(dataset, dataset.rows.map((_, index) => index), definition);
    expect(first.map((branch) => branch.rowIndices.length)).toEqual([80, 20]);
    expect(second).toEqual(first);
  });

  it("creates equal-sized percentile groups", () => {
    const branches = materializeSplit(dataset, dataset.rows.map((_, index) => index), { kind: "percentile", feature: "value", buckets: 4 });
    expect(branches.map((branch) => branch.rowIndices.length)).toEqual([25, 25, 25, 25]);
    expect(branches.map((branch) => branch.label)).toEqual(["P0–P25", "P25–P50", "P50–P75", "P75–P100"]);
  });

  it("creates asymmetric groups from custom percentile cut points", () => {
    const branches = materializeSplit(dataset, dataset.rows.map((_, index) => index), {
      kind: "percentile",
      feature: "value",
      buckets: 5,
      cutpoints: [.9, .95, .99, .999],
    });
    expect(branches.map((branch) => branch.rowIndices.length)).toEqual([90, 5, 4, 1, 0]);
    expect(branches.map((branch) => branch.label)).toEqual(["P0–P90", "P90–P95", "P95–P99", "P99–P99.9", "P99.9–P100"]);
  });

  it("allows up to twenty equal percentile groups", () => {
    const branches = materializeSplit(dataset, dataset.rows.map((_, index) => index), { kind: "percentile", feature: "value", buckets: 20 });
    expect(branches).toHaveLength(20);
    expect(branches.every((branch) => branch.rowIndices.length === 5)).toBe(true);
  });
});
