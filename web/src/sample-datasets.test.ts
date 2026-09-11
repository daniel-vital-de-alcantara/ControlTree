import { describe, expect, it } from "vitest";

import { loadSampleDataset, sampleDatasets } from "./sample-datasets";

describe("built-in sample datasets", () => {
  it("loads a deterministic fictional credit-risk dataset", async () => {
    const sample = sampleDatasets.find((item) => item.id === "banking-demo")!;
    const first = await loadSampleDataset(sample.id);
    const second = await loadSampleDataset(sample.id);

    expect(first.rows).toHaveLength(2000);
    expect(first.columns).toContain(sample.target);
    expect(first.rows[0]).toEqual(second.rows[0]);
    expect(new Set(first.rows.map((row) => row[first.columns.indexOf(sample.target)]))).toEqual(new Set(["yes", "no"]));
  });

  it("loads the attributed UCI bank marketing sample", async () => {
    const sample = sampleDatasets.find((item) => item.id === "bank-marketing")!;
    const dataset = await loadSampleDataset(sample.id);

    expect(dataset.rows).toHaveLength(4521);
    expect(dataset.columns).toContain("term_deposit");
    expect(dataset.columns).not.toContain("y");
    expect(dataset.fileName).toBe("UCI Bank Marketing.csv");
  });
});
