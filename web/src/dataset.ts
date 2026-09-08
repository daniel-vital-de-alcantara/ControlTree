import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";

export type DataValue = string | number | boolean | Date | null;

export type ParsedDataset = {
  fileName: string;
  columns: string[];
  rows: DataValue[][];
};

const SUPPORTED_EXTENSIONS = ["csv", "xlsx"];

function hasContent(row: DataValue[]): boolean {
  return row.some((value) => value !== null && String(value).trim() !== "");
}

function toDataValue(value: unknown): DataValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

export function normalizeTable(
  rawRows: Array<Array<unknown>>,
  fileName: string,
): ParsedDataset {
  const populatedRows = rawRows
    .map((row) => row.map(toDataValue))
    .filter(hasContent);

  if (populatedRows.length < 2) {
    throw new Error("The file needs a header row and at least one data row.");
  }

  const columns = populatedRows[0].map((value) => String(value ?? "").trim());
  if (columns.some((column) => !column)) {
    throw new Error("Every column in the header row needs a name.");
  }
  if (new Set(columns).size !== columns.length) {
    throw new Error("Column names must be unique.");
  }

  const rows = populatedRows.slice(1).map((row) =>
    columns.map((_, index) => row[index] ?? null),
  );
  return { fileName, columns, rows };
}

export async function parseDatasetFile(file: File): Promise<ParsedDataset> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error("Choose a .csv or .xlsx file.");
  }

  if (extension === "xlsx") {
    const rows = await readSheet(file);
    return normalizeTable(rows, file.name);
  }

  const text = await file.text();
  const result = Papa.parse<Array<string | null>>(text, {
    skipEmptyLines: "greedy",
    dynamicTyping: true,
  });
  if (result.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${result.errors[0].message}`);
  }
  return normalizeTable(result.data, file.name);
}

export function summarizeTarget(dataset: ParsedDataset, target: string, rowIndices?: number[]): {
  label: string;
  classCount: number;
  kind: "numeric" | "categorical";
} {
  const targetIndex = dataset.columns.indexOf(target);
  const indices = rowIndices ?? dataset.rows.map((_, index) => index);
  const counts = new Map<string, number>();
  const numericValues: number[] = [];
  let allNumeric = true;
  for (const rowIndex of indices) {
    const row = dataset.rows[rowIndex];
    const value = row[targetIndex];
    if (value === null || String(value).trim() === "") continue;
    const label = value instanceof Date ? value.toISOString() : String(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && !(value instanceof Date)) numericValues.push(numeric);
    else allNumeric = false;
  }

  if (counts.size < 2 && rowIndices === undefined) {
    throw new Error("The target needs at least two distinct values.");
  }

  if (counts.size === 0) {
    return { label: "No target values", classCount: 0, kind: "categorical" };
  }

  if (allNumeric && numericValues.length > 0) {
    const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
    return {
      label: `Avg ${target}: ${new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(average)}`,
      classCount: counts.size,
      kind: "numeric",
    };
  }

  const [mostCommonLabel, mostCommonCount] = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0];
  const observedCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return {
    label: `${Math.round((mostCommonCount / observedCount) * 100)}% ${target} = ${mostCommonLabel}`,
    classCount: counts.size,
    kind: "categorical",
  };
}
