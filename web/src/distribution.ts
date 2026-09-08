import type { DataValue, ParsedDataset } from "./dataset";
import type { TreeNode } from "./domain";

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
};

export type CategoryFrequency = {
  label: string;
  count: number;
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
  const numeric = present.length > 0 && present.every((value) =>
    typeof value === "number" || (typeof value === "string" && Number.isFinite(Number(value))),
  );
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

  const numbers = present.map(Number).sort((left, right) => left - right);
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

export function buildHistogram(numbers: number[], binWidth: number | null): HistogramBin[] {
  if (numbers.length === 0) return [];
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  if (minimum === maximum) return [{ start: minimum, end: maximum, count: numbers.length }];
  const automatic = binWidth === null;
  const width = automatic ? (maximum - minimum) / automaticBinCount(numbers.length) : binWidth;
  if (!Number.isFinite(width) || width <= 0) return [];
  const start = automatic ? minimum : Math.floor(minimum / width) * width;
  const binCount = automatic
    ? automaticBinCount(numbers.length)
    : Math.floor((maximum - start) / width) + 1;
  if (binCount > 200) return [];
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: start + index * width,
    end: automatic && index === binCount - 1 ? maximum : start + (index + 1) * width,
    count: 0,
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
): DistributionSnapshot {
  const profile = profileVariable(dataset, settings.variable, node.rowIndices);
  const histogram = profile.numeric ? buildHistogram(profile.numbers, settings.binWidth) : [];
  const requestedBinCount = profile.numeric && settings.binWidth
    ? Math.floor((Math.max(...profile.numbers) - Math.floor(Math.min(...profile.numbers) / settings.binWidth) * settings.binWidth) / settings.binWidth) + 1
    : 0;
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
    categories: profile.numeric ? [] : displayCategories(profile.categories),
    ...(requestedBinCount > 200 ? {
      histogramError: `This width would create ${requestedBinCount.toLocaleString()} bins. Choose a larger width.`,
    } : {}),
  };
}
