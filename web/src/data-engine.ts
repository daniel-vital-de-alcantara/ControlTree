import type { DataValue, ParsedDataset } from "./dataset";
import type { TreeSplitDefinition } from "./domain";

export type MaterializedBranch = {
  label: string;
  rowIndices: number[];
};

export function isMissing(value: DataValue | undefined): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

export function columnPosition(dataset: ParsedDataset, feature: string): number {
  const position = dataset.columns.indexOf(feature);
  if (position < 0) throw new Error(`Variable '${feature}' was not found in this dataset.`);
  return position;
}

export function allRowIndices(dataset: ParsedDataset): number[] {
  return dataset.rows.map((_, index) => index);
}

export function observedRowIndices(dataset: ParsedDataset, rowIndices?: number[]): number[] {
  return rowIndices ?? allRowIndices(dataset);
}

export function asNumber(value: DataValue | undefined): number | null {
  if (isMissing(value) || value instanceof Date || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function isNumericColumn(
  dataset: ParsedDataset,
  feature: string,
  rowIndices?: number[],
): boolean {
  const position = columnPosition(dataset, feature);
  const values = observedRowIndices(dataset, rowIndices)
    .map((rowIndex) => dataset.rows[rowIndex]?.[position])
    .filter((value) => !isMissing(value));
  return values.length > 0 && values.every((value) => asNumber(value) !== null);
}

function valueKey(value: DataValue): string {
  if (value instanceof Date) return `date:${value.toISOString()}`;
  return `${typeof value}:${String(value)}`;
}

function valuesEqual(left: DataValue | undefined, right: string | number | boolean): boolean {
  if (isMissing(left) || left instanceof Date) return false;
  return left === right;
}

export function splitRows(
  dataset: ParsedDataset,
  rowIndices: number[],
  feature: string,
  operator: "<=" | "==",
  value: string | number | boolean,
): [number[], number[]] {
  const position = columnPosition(dataset, feature);
  const matching: number[] = [];
  const remaining: number[] = [];
  for (const rowIndex of rowIndices) {
    const cell = dataset.rows[rowIndex]?.[position];
    const matches = operator === "<="
      ? asNumber(cell) !== null && asNumber(cell)! <= Number(value)
      : valuesEqual(cell, value);
    (matches ? matching : remaining).push(rowIndex);
  }
  return [matching, remaining];
}

function formatCutpoint(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

export function materializeManualBranches(
  dataset: ParsedDataset,
  rowIndices: number[],
  feature: string,
  values: Array<string | number | boolean>,
  forceCategorical: boolean,
  includeOther: boolean,
): MaterializedBranch[] {
  const position = columnPosition(dataset, feature);
  const numeric = isNumericColumn(dataset, feature, rowIndices) && !forceCategorical;
  const branches: MaterializedBranch[] = [];

  if (numeric) {
    const cutpoints = [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
    if (cutpoints.length === 0) throw new Error("Enter at least one numeric cut point.");
    let previous: number | null = null;
    for (const cutpoint of cutpoints) {
      const indices = rowIndices.filter((rowIndex) => {
        const current = asNumber(dataset.rows[rowIndex]?.[position]);
        return current !== null && current <= cutpoint && (previous === null || current > previous);
      });
      const label = previous === null
        ? `<=${formatCutpoint(cutpoint)}`
        : `(${formatCutpoint(previous)}, ${formatCutpoint(cutpoint)}]`;
      if (indices.length > 0) branches.push({ label, rowIndices: indices });
      previous = cutpoint;
    }
    const last = cutpoints[cutpoints.length - 1];
    const upper = rowIndices.filter((rowIndex) => {
      const current = asNumber(dataset.rows[rowIndex]?.[position]);
      return current !== null && current > last;
    });
    if (upper.length > 0) branches.push({ label: `>${formatCutpoint(last)}`, rowIndices: upper });
    if (includeOther) {
      const missing = rowIndices.filter((rowIndex) => isMissing(dataset.rows[rowIndex]?.[position]));
      if (missing.length > 0) branches.push({ label: "Other / missing", rowIndices: missing });
    }
  } else {
    if (values.length === 0) throw new Error("Choose at least one category.");
    for (const value of values) {
      const indices = rowIndices.filter((rowIndex) => valuesEqual(dataset.rows[rowIndex]?.[position], value));
      if (indices.length > 0) branches.push({ label: String(value), rowIndices: indices });
    }
    if (includeOther) {
      const other = rowIndices.filter((rowIndex) => {
        const cell = dataset.rows[rowIndex]?.[position];
        return isMissing(cell) || !values.some((value) => valuesEqual(cell, value));
      });
      if (other.length > 0) branches.push({ label: "Other / missing", rowIndices: other });
    }
  }

  if (branches.length < 2) {
    throw new Error("Manual split produced fewer than 2 non-empty branches. Choose different values.");
  }
  return branches;
}

export function materializeSplit(
  dataset: ParsedDataset,
  rowIndices: number[],
  split: TreeSplitDefinition,
): MaterializedBranch[] {
  if (split.kind === "manual") {
    return materializeManualBranches(
      dataset,
      rowIndices,
      split.feature,
      split.values,
      split.forceCategorical,
      split.includeOther,
    );
  }
  const [matching, remaining] = splitRows(
    dataset,
    rowIndices,
    split.feature,
    split.operator,
    split.value,
  );
  const displayed = typeof split.value === "string" ? `“${split.value}”` : String(split.value);
  const rule = `${split.feature} ${split.operator} ${displayed}`;
  return [
    { label: rule, rowIndices: matching },
    { label: `not (${rule})`, rowIndices: remaining },
  ];
}

export function frequencyValues(values: DataValue[]): Array<string | number | boolean> {
  const counts = new Map<string, { value: string | number | boolean; count: number; order: number }>();
  values.forEach((value, order) => {
    if (value === null || value instanceof Date || isMissing(value)) return;
    const key = valueKey(value);
    const current = counts.get(key);
    if (current) current.count += 1;
    else counts.set(key, { value, count: 1, order });
  });
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map(({ value }) => value);
}
