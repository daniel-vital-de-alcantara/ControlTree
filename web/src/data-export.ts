import Papa from "papaparse";

import { asNumber, isNumericColumn } from "./data-engine";
import type { DataValue, ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";

export type EnrichedDataset = {
  columns: string[];
  rows: DataValue[][];
  targetKind?: "numeric" | "categorical";
};

function deepestNodeByRow(tree: TreeNode, rowCount: number): TreeNode[] {
  const assignments = Array<TreeNode>(rowCount).fill(tree);
  function visit(node: TreeNode) {
    node.rowIndices?.forEach((rowIndex) => {
      if (rowIndex >= 0 && rowIndex < rowCount) assignments[rowIndex] = node;
    });
    node.children.forEach(visit);
  }
  visit(tree);
  return assignments;
}

function nodePrediction(dataset: ParsedDataset, node: TreeNode, target: string, kind: "numeric" | "categorical"): DataValue {
  const targetIndex = dataset.columns.indexOf(target);
  const indices = node.rowIndices ?? dataset.rows.map((_, index) => index);
  if (kind === "numeric") {
    const values = indices
      .map((rowIndex) => asNumber(dataset.rows[rowIndex]?.[targetIndex], dataset, target))
      .filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  const counts = new Map<string, { value: DataValue; count: number }>();
  indices.forEach((rowIndex) => {
    const value = dataset.rows[rowIndex]?.[targetIndex];
    if (value === null || value === undefined || String(value).trim() === "") return;
    const key = value instanceof Date ? value.toISOString() : String(value);
    const current = counts.get(key);
    counts.set(key, { value, count: (current?.count ?? 0) + 1 });
  });
  return [...counts.values()].sort((left, right) => right.count - left.count)[0]?.value ?? null;
}

export function enrichDataset(dataset: ParsedDataset, tree: TreeNode, target?: string | null): EnrichedDataset {
  const assignments = deepestNodeByRow(tree, dataset.rows.length);
  const validTarget = target && dataset.columns.includes(target) ? target : undefined;
  const targetKind = validTarget ? isNumericColumn(dataset, validTarget) ? "numeric" : "categorical" : undefined;
  const targetIndex = validTarget ? dataset.columns.indexOf(validTarget) : -1;
  const predictionCache = new Map<string, DataValue>();

  const columns = ["node id", "node name"];
  if (validTarget) columns.push("predicted", targetKind === "numeric" ? "residual" : "error");

  const rows = dataset.rows.map((row, rowIndex) => {
    const node = assignments[rowIndex];
    const extra: DataValue[] = [node.id, node.title];
    if (validTarget && targetKind) {
      if (!predictionCache.has(node.id)) predictionCache.set(node.id, nodePrediction(dataset, node, validTarget, targetKind));
      const prediction = predictionCache.get(node.id) ?? null;
      const actual = row[targetIndex];
      let difference: DataValue = null;
      if (actual !== null && String(actual).trim() !== "" && prediction !== null) {
        if (targetKind === "numeric") {
          const actualNumber = asNumber(actual, dataset, validTarget);
          difference = actualNumber === null || typeof prediction !== "number" ? null : actualNumber - prediction;
        } else {
          difference = String(actual) === String(prediction) ? 0 : 1;
        }
      }
      extra.push(prediction, difference);
    }
    return [...extra, ...row];
  });

  return { columns: [...columns, ...dataset.columns], rows, ...(targetKind ? { targetKind } : {}) };
}

function downloadableValue(value: DataValue): string | number | boolean | null {
  return value instanceof Date ? value.toISOString() : value;
}

export function downloadEnrichedCsv(dataset: ParsedDataset, tree: TreeNode, target?: string | null): string {
  const enriched = enrichDataset(dataset, tree, target);
  const csv = Papa.unparse([
    enriched.columns,
    ...enriched.rows.map((row) => row.map(downloadableValue)),
  ]);
  const stem = dataset.fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-") || "data";
  const fileName = `${stem}-controltree.csv`;
  const blob = new Blob([`\ufeff${csv}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return fileName;
}
