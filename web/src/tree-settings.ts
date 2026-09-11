import type { ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { asNumber, isNumericColumn } from "./data-engine";

export type TreeAppearance = {
  nodeColor: string;
  accentColor: string;
  connectorColor: string;
  backgroundColor: string;
  showGrid: boolean;
  fontScale: number;
  nodeSpacing: number;
  layout: "tidy" | "compact";
  branchOrder: "split" | "target-high-left" | "target-high-right";
  customBranchOrders: Record<string, string[]>;
};

export type NodeFieldVisibility = {
  nodeName: boolean;
  nodeTitle: boolean;
  rowCount: boolean;
  rowCountFormat: "count" | "percent_root" | "percent_parent";
  rowCountSecondaryFormat?: "percent_root" | "percent_parent";
};

export type SummaryAggregation = "average" | "sum" | "min" | "max" | "count" | "distinct" | "missing" | "mode";
export type MetricFormat = "number" | "percentage" | "compact" | "percent_root" | "percent_parent";

export type SummaryMetric = {
  id: string;
  variable: string;
  aggregation: SummaryAggregation;
  highlighted: boolean;
  label?: string;
  format?: MetricFormat;
  secondaryAggregation?: SummaryAggregation;
  secondaryFormat?: MetricFormat;
  secondarySeparator?: "parentheses" | "dash";
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
  fontScale: 1,
  nodeSpacing: 1,
  layout: "tidy",
  branchOrder: "split",
  customBranchOrders: {},
};

export const defaultNodeFields: NodeFieldVisibility = {
  nodeName: false,
  nodeTitle: true,
  rowCount: true,
  rowCountFormat: "count",
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
  if (metric.label?.trim()) return metric.label.trim();
  const aggregation = allAggregations.find((item) => item.value === metric.aggregation)?.label;
  return `${aggregation} ${metric.variable}`;
}

type MetricValue = { value: number | string; modeShare?: number } | null;

function metricValue(dataset: ParsedDataset, rowIndices: number[] | undefined, metric: Pick<SummaryMetric, "variable" | "aggregation">): MetricValue {
  const values = observedValues(dataset, metric.variable, rowIndices);
  const present = values.filter((value) => value !== null && String(value).trim() !== "");
  if (metric.aggregation === "missing") return { value: values.length - present.length };
  if (metric.aggregation === "count") return { value: present.length };
  if (metric.aggregation === "distinct") return { value: new Set(present.map(String)).size };
  if (metric.aggregation === "mode") {
    if (!present.length) return null;
    const counts = new Map<string, number>();
    present.forEach((value) => counts.set(String(value), (counts.get(String(value)) ?? 0) + 1));
    const [label, count] = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    return { value: label, modeShare: count / present.length };
  }
  const numbers = present
    .map((value) => asNumber(value, dataset, metric.variable))
    .filter((value): value is number => value !== null);
  if (!numbers.length) return null;
  if (metric.aggregation === "sum") return { value: numbers.reduce((sum, item) => sum + item, 0) };
  if (metric.aggregation === "min") return { value: Math.min(...numbers) };
  if (metric.aggregation === "max") return { value: Math.max(...numbers) };
  return { value: numbers.reduce((sum, item) => sum + item, 0) / numbers.length };
}

export function metricSortValue(dataset: ParsedDataset, rowIndices: number[] | undefined, metric: SummaryMetric): number | null {
  const result = metricValue(dataset, rowIndices, metric);
  if (!result) return null;
  if (typeof result.value === "number") return result.value;
  return result.modeShare ?? null;
}

function percent(value: number): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function summarizeMetric(
  dataset: ParsedDataset,
  rowIndices: number[] | undefined,
  metric: SummaryMetric,
  comparisonRowIndices?: number[],
  secondaryComparisonRowIndices?: number[],
): string {
  function summarizeOperation(aggregation: SummaryAggregation, format: MetricFormat | undefined, comparison?: number[]): string {
  const operation = { variable: metric.variable, aggregation };
  const current = metricValue(dataset, rowIndices, operation);
  if (!current) return "—";
  if (format === "percentage") {
    if (current.modeShare !== undefined) return percent(current.modeShare * 100);
    if (typeof current.value === "number") return percent(current.value * 100);
  }
  if (format === "compact" && typeof current.value === "number") {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(current.value);
  }
  if ((format === "percent_root" || format === "percent_parent") && comparison) {
    const comparisonValue = metricValue(dataset, comparison, operation);
    if (typeof current.value !== "number" || typeof comparisonValue?.value !== "number" || comparisonValue.value === 0) return "—";
    return percent(current.value / comparisonValue.value * 100);
  }
  return typeof current.value === "number"
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(current.value)
    : current.value;
  }
  const primary = summarizeOperation(metric.aggregation, metric.format, comparisonRowIndices);
  if (!metric.secondaryAggregation) return primary;
  const secondary = summarizeOperation(metric.secondaryAggregation, metric.secondaryFormat, secondaryComparisonRowIndices);
  return metric.secondarySeparator === "dash" ? `${primary} – ${secondary}` : `${primary} (${secondary})`;
}

export function buildNodeSummaries(
  root: TreeNode,
  dataset: ParsedDataset | undefined,
  metrics: SummaryMetric[],
): NodeSummaryMap {
  if (!dataset || metrics.length === 0) return {};
  const activeDataset = dataset;
  const summaries: NodeSummaryMap = {};
  const rootIndices = root.rowIndices ?? dataset.rows.map((_, index) => index);
  function visit(node: TreeNode, parent?: TreeNode) {
    summaries[node.id] = metrics.map((metric) => ({
      id: metric.id,
      label: metricLabel(metric),
      value: summarizeMetric(
        activeDataset,
        node.rowIndices,
        metric,
        metric.format === "percent_root" ? rootIndices : metric.format === "percent_parent" ? parent?.rowIndices ?? rootIndices : undefined,
        metric.secondaryFormat === "percent_root" ? rootIndices : metric.secondaryFormat === "percent_parent" ? parent?.rowIndices ?? rootIndices : undefined,
      ),
      highlighted: metric.highlighted,
    }));
    node.children.forEach((child) => visit(child, node));
  }
  visit(root);
  return summaries;
}
