import type { ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { asNumber, isNumericColumn } from "./data-engine";

export type TreeAppearance = {
  nodeColor: string;
  accentColor: string;
  connectorColor: string;
  backgroundColor: string;
  showGrid: boolean;
};

export type NodeFieldVisibility = {
  nodeName: boolean;
  nodeTitle: boolean;
  rowCount: boolean;
};

export type SummaryAggregation = "average" | "sum" | "min" | "max" | "count" | "distinct" | "missing" | "mode";
export type MetricFormat = "number" | "percentage";

export type SummaryMetric = {
  id: string;
  variable: string;
  aggregation: SummaryAggregation;
  highlighted: boolean;
  format?: MetricFormat;
  target?: boolean;
};

export type NodeSummary = { id: string; label: string; value: string; highlighted: boolean };
export type NodeSummaryMap = Record<string, NodeSummary[]>;

export const defaultAppearance: TreeAppearance = {
  nodeColor: "#ffffff",
  accentColor: "#173e34",
  connectorColor: "#8e9d95",
  backgroundColor: "#faf9f5",
  showGrid: true,
};

export const defaultNodeFields: NodeFieldVisibility = {
  nodeName: true,
  nodeTitle: true,
  rowCount: true,
};

export const allAggregations: Array<{ value: SummaryAggregation; label: string }> = [
  { value: "average", label: "Average" },
  { value: "sum", label: "Sum" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "count", label: "Count values" },
  { value: "distinct", label: "Count distinct" },
  { value: "missing", label: "Count missing" },
  { value: "mode", label: "Most common" },
];

function observedValues(dataset: ParsedDataset, variable: string, rowIndices?: number[]) {
  const columnIndex = dataset.columns.indexOf(variable);
  const indices = rowIndices ?? dataset.rows.map((_, index) => index);
  return indices.map((index) => dataset.rows[index]?.[columnIndex] ?? null);
}

export function isNumericVariable(
  dataset: ParsedDataset,
  variable: string,
  rowIndices?: number[],
): boolean {
  return isNumericColumn(dataset, variable, rowIndices);
}

export function distinctValues(
  dataset: ParsedDataset,
  variable: string,
  rowIndices?: number[],
): Array<string | number | boolean> {
  const values = observedValues(dataset, variable, rowIndices)
    .filter((value): value is string | number | boolean =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
    );
  return [...new Map(values.map((value) => [String(value), value])).values()]
    .sort((left, right) => String(left).localeCompare(String(right), undefined, { numeric: true }));
}

export function metricLabel(metric: SummaryMetric): string {
  const aggregation = allAggregations.find((item) => item.value === metric.aggregation)?.label;
  return `${aggregation} ${metric.variable}`;
}

export function summarizeMetric(
  dataset: ParsedDataset,
  rowIndices: number[] | undefined,
  metric: SummaryMetric,
): string {
  const values = observedValues(dataset, metric.variable, rowIndices);
  const present = values.filter((value) => value !== null && String(value).trim() !== "");

  if (metric.aggregation === "mode") {
    if (!present.length) return "—";
    const counts = new Map<string, number>();
    present.forEach((value) => counts.set(String(value), (counts.get(String(value)) ?? 0) + 1));
    const [label, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    return metric.format === "percentage"
      ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(count / present.length * 100)}%`
      : label;
  }

  if (metric.aggregation === "missing") return (values.length - present.length).toLocaleString();
  if (metric.aggregation === "count") return present.length.toLocaleString();
  if (metric.aggregation === "distinct") {
    return new Set(present.map(String)).size.toLocaleString();
  }

  const numbers = present
    .map((value) => asNumber(value, dataset, metric.variable))
    .filter((value): value is number => value !== null);
  if (numbers.length === 0) return "—";
  let value: number;
  if (metric.aggregation === "sum") value = numbers.reduce((sum, item) => sum + item, 0);
  else if (metric.aggregation === "min") value = Math.min(...numbers);
  else if (metric.aggregation === "max") value = Math.max(...numbers);
  else value = numbers.reduce((sum, item) => sum + item, 0) / numbers.length;
  return metric.format === "percentage"
    ? `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value * 100)}%`
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function buildNodeSummaries(
  root: TreeNode,
  dataset: ParsedDataset | undefined,
  metrics: SummaryMetric[],
): NodeSummaryMap {
  if (!dataset || metrics.length === 0) return {};
  const activeDataset = dataset;
  const summaries: NodeSummaryMap = {};
  function visit(node: TreeNode) {
    summaries[node.id] = metrics.map((metric) => ({
      id: metric.id,
      label: metricLabel(metric),
      value: summarizeMetric(activeDataset, node.rowIndices, metric),
      highlighted: metric.highlighted,
    }));
    node.children.forEach(visit);
  }
  visit(root);
  return summaries;
}
