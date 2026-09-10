import { describe, expect, it } from "vitest";

import type { ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { enrichDataset } from "./data-export";

const tree: TreeNode = {
  id: "root",
  title: "Portfolio",
  samples: 4,
  rowIndices: [0, 1, 2, 3],
  children: [
    { id: "root.1", title: "Lower", samples: 2, rowIndices: [0, 1], children: [] },
    { id: "root.2", title: "Higher", samples: 2, rowIndices: [2, 3], children: [] },
  ],
};

describe("enriched data export", () => {
  it("puts node identity before every original column", () => {
    const dataset: ParsedDataset = {
      fileName: "sample.csv",
      columns: ["amount"],
      rows: [[10], [20], [30], [40]],
    };
    const result = enrichDataset(dataset, tree);

    expect(result.columns).toEqual(["node id", "node name", "amount"]);
    expect(result.rows[0]).toEqual(["root.1", "Lower", 10]);
    expect(result.rows[3]).toEqual(["root.2", "Higher", 40]);
  });

  it("adds node means and residuals for a numeric target", () => {
    const dataset: ParsedDataset = {
      fileName: "sample.csv",
      columns: ["target"],
      rows: [[10], [20], [30], [50]],
      inferredTypes: { target: "numeric" },
    };
    const result = enrichDataset(dataset, tree, "target");

    expect(result.columns).toEqual(["node id", "node name", "predicted", "residual", "target"]);
    expect(result.rows).toEqual([
      ["root.1", "Lower", 15, -5, 10],
      ["root.1", "Lower", 15, 5, 20],
      ["root.2", "Higher", 40, -10, 30],
      ["root.2", "Higher", 40, 10, 50],
    ]);
  });

  it("adds the modal prediction and a zero-or-one categorical error", () => {
    const dataset: ParsedDataset = {
      fileName: "sample.csv",
      columns: ["target"],
      rows: [["yes"], ["yes"], ["no"], ["yes"]],
      inferredTypes: { target: "categorical" },
    };
    const result = enrichDataset(dataset, tree, "target");

    expect(result.columns).toEqual(["node id", "node name", "predicted", "error", "target"]);
    expect(result.rows[0].slice(0, 4)).toEqual(["root.1", "Lower", "yes", 0]);
    expect(result.rows[2].slice(0, 4)).toEqual(["root.2", "Higher", "no", 0]);
    expect(result.rows[3].slice(0, 4)).toEqual(["root.2", "Higher", "no", 1]);
  });

  it("assigns rows excluded from child branches to their deepest containing node", () => {
    const dataset: ParsedDataset = { fileName: "sample.csv", columns: ["value"], rows: [[1], [2], [3]] };
    const partialTree: TreeNode = {
      id: "root",
      title: "All rows",
      samples: 3,
      rowIndices: [0, 1, 2],
      children: [{ id: "root.1", title: "Included", samples: 1, rowIndices: [0], children: [] }],
    };
    const result = enrichDataset(dataset, partialTree);

    expect(result.rows.map((row) => row[0])).toEqual(["root.1", "root", "root"]);
  });
});
