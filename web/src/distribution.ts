import type { DataValue, ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";
import { asNumber, isNumericColumn } from "./data-engine";

export type DistributionScale = "count" | "percentage";

export type DistributionSettings = {
  variable: string;
  binWidth: number | null;
  scale: DistributionScale;
};

export type NumericStatistics = {
  count: number;
  missing: number;
  distinct: number;
  minimum: number;
  maximum: number;
  average: number;
  median: number;
  variance: number;
  standardDeviation: number;
};

export type HistogramBin = {
  start: number;
  end: number;
  count: number;
  overflow?: boolean;
  rowIndices?: number[];
  targetAverage?: number;
};

export type CategoryFrequency = {
  label: string;
  count: number;
  rowIndices?: number[];
  targetAverage?: number;
};

export type VariableProfile = {
  rowCount: number;
  count: number;
  missing: number;
  distinct: number;
  numeric: boolean;
  numbers: number[];
  categories: CategoryFrequency[];
  statistics?: NumericStatistics;
};

export type DistributionSnapshot = {
  nodeId: string;
  nodeTitle: string;
  nodeSamples: number;
  variable: string;
  scale: DistributionScale;
  binWidth: number | null;
  numeric: boolean;
  count: number;
  missing: number;
  distinct: number;
  statistics?: NumericStatistics;
  histogram: HistogramBin[];
  categories: CategoryFrequency[];
  histogramError?: string;
  targetVariable?: string;
  targetComparison?: boolean;
};

function valueLabel(value: DataValue): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

export function profileVariable(
  dataset: ParsedDataset,
  variable: string,
  rowIndices?: number[],
): VariableProfile {
  const columnIndex = dataset.columns.indexOf(variable);
  const indices = rowIndices ?? dataset.rows.map((_, index) => index);
  const values = indices.map((index) => dataset.rows[index]?.[columnIndex] ?? null);
  const present = values.filter((value): value is Exclude<DataValue, null> =>
    value !== null && String(value).trim() !== "",
  );
  const numeric = isNumericColumn(dataset, variable, indices);
  const counts = new Map<string, number>();
  present.forEach((value) => {
    const label = valueLabel(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  const categories = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  const base: VariableProfile = {
    rowCount: values.length,
    count: present.length,
    missing: values.length - present.length,
    distinct: counts.size,
    numeric,
    numbers: [],
    categories,
  };
  if (!numeric) return base;

  const numbers = present
    .map((value) => asNumber(value, dataset, variable))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  if (numbers.length === 0) return { ...base, numeric: false };
  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const middle = Math.floor(numbers.length / 2);
  const median = numbers.length % 2
    ? numbers[middle]
    : (numbers[middle - 1] + numbers[middle]) / 2;
  const variance = numbers.reduce((sum, value) => sum + (value - average) ** 2, 0) / numbers.length;
  return {
    ...base,
    numbers,
    statistics: {
      count: numbers.length,
      missing: base.missing,
      distinct: base.distinct,
      minimum: numbers[0],
      maximum: numbers[numbers.length - 1],
      average,
      median,
      variance,
      standardDeviation: Math.sqrt(variance),
    },
  };
}

export function automaticBinCount(valueCount: number): number {
  if (valueCount <= 1) return 1;
  return Math.min(30, Math.max(5, Math.ceil(Math.log2(valueCount) + 1)));
}

export function buildHistogram(numbers: number[], binWidth: number | null, maximumVisibleBins = 24): HistogramBin[] {
  if (numbers.length === 0) return [];
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  if (minimum === maximum) return [{ start: minimum, end: maximum, count: numbers.length }];
  const automatic = binWidth === null;
  const width = automatic ? (maximum - minimum) / automaticBinCount(numbers.length) : binWidth;
  if (!Number.isFinite(width) || width <= 0) return [];
  const start = automatic ? minimum : Math.floor(minimum / width) * width;
  const requestedBinCount = automatic
    ? automaticBinCount(numbers.length)
    : Math.floor((maximum - start) / width) + 1;
  const overflow = requestedBinCount > maximumVisibleBins;
  const binCount = overflow ? maximumVisibleBins : requestedBinCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: start + index * width,
    end: index === binCount - 1 && (automatic || overflow) ? maximum : start + (index + 1) * width,
    count: 0,
    ...(overflow && index === binCount - 1 ? { overflow: true } : {}),
  }));
  numbers.forEach((value) => {
    const index = Math.min(Math.floor((value - start) / width), binCount - 1);
    bins[index].count += 1;
  });
  return bins;
}

export function displayCategories(categories: CategoryFrequency[], limit = 12): CategoryFrequency[] {
  if (categories.length <= limit) return categories;
  const visible = categories.slice(0, limit);
  const otherCount = categories.slice(limit).reduce((sum, item) => sum + item.count, 0);
  return [...visible, { label: `Other (${categories.length - limit})`, count: otherCount }];
}

export function formatStatistic(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function createDistributionSnapshot(
  dataset: ParsedDataset,
  node: TreeNode,
  settings: DistributionSettings,
  targetVariable?: string | null,
): DistributionSnapshot {
  const profile = profileVariable(dataset, settings.variable, node.rowIndices);
  const histogram = profile.numeric ? buildHistogram(profile.numbers, settings.binWidth) : [];
  const sourceRows = node.rowIndices ?? dataset.rows.map((_, index) => index);
  const variablePosition = dataset.columns.indexOf(settings.variable);
  const targetPosition = targetVariable ? dataset.columns.indexOf(targetVariable) : -1;
  const compareTarget = Boolean(targetVariable && targetVariable !== settings.variable && targetPosition >= 0 && isNumericColumn(dataset, targetVariable!, sourceRows));
  const averageTarget = (indices: number[]) => {
    if (!compareTarget) return undefined;
    const values = indices.map((index) => asNumber(dataset.rows[index]?.[targetPosition], dataset, targetVariable!)).filter((value): value is number => value !== null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
  };
  histogram.forEach((bin, index) => {
    const indices = sourceRows.filter((rowIndex) => {
      const value = asNumber(dataset.rows[rowIndex]?.[variablePosition], dataset, settings.variable);
      if (value === null) return false;
      return value >= bin.start && (index === histogram.length - 1 || bin.overflow ? value <= bin.end : value < bin.end);
    });
    bin.rowIndices = indices;
    bin.targetAverage = averageTarget(indices);
  });
  const displayedCategories = profile.numeric ? [] : displayCategories(profile.categories);
  displayedCategories.forEach((category) => {
    const isOther = category.label.startsWith("Other (");
    const visibleLabels = new Set(displayedCategories.filter((item) => !item.label.startsWith("Other (")).map((item) => item.label));
    const indices = sourceRows.filter((rowIndex) => {
      const value = dataset.rows[rowIndex]?.[variablePosition];
      const label = value === null || String(value).trim() === "" ? "" : valueLabel(value);
      return isOther ? Boolean(label) && !visibleLabels.has(label) : label === category.label;
    });
    category.rowIndices = indices;
    category.targetAverage = averageTarget(indices);
  });
  return {
    nodeId: node.id,
    nodeTitle: node.title,
    nodeSamples: node.samples,
    variable: settings.variable,
    scale: settings.scale,
    binWidth: settings.binWidth,
    numeric: profile.numeric,
    count: profile.count,
    missing: profile.missing,
    distinct: profile.distinct,
    statistics: profile.statistics,
    histogram,
    categories: displayedCategories,
    ...(targetVariable ? { targetVariable } : {}),
    targetComparison: compareTarget,
  };
}

export type ScatterBounds = { xMin: number | null; xMax: number | null; yMin: number | null; yMax: number | null };
export type ScatterPoint = { x: number; y: number; rowIndex: number };
export type ScatterSnapshot = {
  xVariable: string;
  yVariable: string;
  points: ScatterPoint[];
  displayedPoints: ScatterPoint[];
  excluded: number;
  total: number;
  xDomain: [number, number];
  yDomain: [number, number];
};

export function createScatterSnapshot(dataset: ParsedDataset, node: TreeNode, xVariable: string, yVariable: string, bounds: ScatterBounds, maximumPoints = 1200): ScatterSnapshot {
  const xPosition = dataset.columns.indexOf(xVariable);
  const yPosition = dataset.columns.indexOf(yVariable);
  const rows = node.rowIndices ?? dataset.rows.map((_, index) => index);
  const numeric = rows.map((rowIndex) => ({
    rowIndex,
    x: asNumber(dataset.rows[rowIndex]?.[xPosition], dataset, xVariable),
    y: asNumber(dataset.rows[rowIndex]?.[yPosition], dataset, yVariable),
  })).filter((item): item is ScatterPoint => item.x !== null && item.y !== null);
  const filtered = numeric.filter((point) =>
    (bounds.xMin === null || point.x >= bounds.xMin) && (bounds.xMax === null || point.x <= bounds.xMax) &&
    (bounds.yMin === null || point.y >= bounds.yMin) && (bounds.yMax === null || point.y <= bounds.yMax));
  const domain = (values: number[], lower: number | null, upper: number | null): [number, number] => {
    const minimum = lower ?? (values.length ? Math.min(...values) : 0);
    const maximum = upper ?? (values.length ? Math.max(...values) : 1);
    return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum];
  };
  const step = Math.max(1, Math.ceil(filtered.length / maximumPoints));
  return {
    xVariable, yVariable, points: filtered, displayedPoints: filtered.filter((_, index) => index % step === 0),
    excluded: rows.length - filtered.length, total: rows.length,
    xDomain: domain(filtered.map((point) => point.x), bounds.xMin, bounds.xMax),
    yDomain: domain(filtered.map((point) => point.y), bounds.yMin, bounds.yMax),
  };
}

export function takeExampleRows(dataset: ParsedDataset, rowIndices: number[], variables: string[], seed: number, count = 8): Array<Record<string, DataValue>> {
  const ranked = [...rowIndices].sort((left, right) => {
    const score = (value: number) => Math.sin((value + 1) * 99991 + seed) * 10000;
    return (score(left) - Math.floor(score(left))) - (score(right) - Math.floor(score(right)));
  }).slice(0, count);
  return ranked.map((rowIndex) => Object.fromEntries(variables.map((variable) => [variable, dataset.rows[rowIndex]?.[dataset.columns.indexOf(variable)] ?? null])));
}
