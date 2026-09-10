import Papa from "papaparse";

export type DataValue = string | number | boolean | Date | null;
export type VariableType = "automatic" | "numeric" | "categorical";
export type VariableTypeOverrides = Record<string, Exclude<VariableType, "automatic">>;
export type NumberFormat = "dot" | "comma" | "grouped";

export type ParsedDataset = {
  fileName: string;
  fileSize?: number;
  fileLastModified?: number;
  columns: string[];
  rows: DataValue[][];
  inferredTypes?: Record<string, Exclude<VariableType, "automatic">>;
  numberFormats?: Record<string, NumberFormat>;
  variableTypes?: VariableTypeOverrides;
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

function numberText(value: string): string {
  return value.trim().replace(/[\s\u00a0\u202f']/g, "");
}

function localeDecimalMark(): "." | "," {
  const separator = new Intl.NumberFormat().formatToParts(1.1)
    .find((part) => part.type === "decimal")?.value;
  return separator === "," ? "," : ".";
}

function inferNumberFormat(values: DataValue[]): NumberFormat {
  const texts = values.filter((value): value is string => typeof value === "string")
    .map(numberText)
    .filter(Boolean);
  const strongMarks = new Set<"." | ",">();
  const ambiguousMarks = new Set<"." | ",">();
  let grouped = false;

  for (const text of texts) {
    const dotCount = (text.match(/\./g) ?? []).length;
    const commaCount = (text.match(/,/g) ?? []).length;
    if (dotCount && commaCount) {
      strongMarks.add(text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",");
      continue;
    }
    const mark: "." | "," | null = dotCount ? "." : commaCount ? "," : null;
    if (!mark) continue;
    const count = mark === "." ? dotCount : commaCount;
    const parts = text.replace(/^[+-]/, "").split(mark);
    if (count > 1 && parts.slice(1).every((part) => part.length === 3)) {
      grouped = true;
      continue;
    }
    const decimalLength = parts.at(-1)?.length ?? 0;
    if (count === 1 && decimalLength === 3) ambiguousMarks.add(mark);
    else strongMarks.add(mark);
  }

  if (strongMarks.size === 1) return strongMarks.has(",") ? "comma" : "dot";
  if (strongMarks.size > 1) return localeDecimalMark() === "," ? "comma" : "dot";
  if (grouped) return "grouped";
  if (ambiguousMarks.size === 1) {
    const mark = [...ambiguousMarks][0];
    return localeDecimalMark() === mark ? (mark === "," ? "comma" : "dot") : "grouped";
  }
  return "dot";
}

export function parseLocalizedNumber(value: DataValue | undefined, format: NumberFormat = "dot"): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = numberText(value);
  if (!text || !/^[+-]?[\d.,]+$/.test(text)) return null;
  let normalized = text;
  if (format === "comma") normalized = normalized.replace(/\./g, "").replace(",", ".");
  else if (format === "dot") normalized = normalized.replace(/,/g, "");
  else normalized = normalized.replace(/[.,]/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function looksLikeCode(value: DataValue): boolean {
  return typeof value === "string" && /^[+-]?0\d+$/.test(numberText(value));
}

function inferColumn(values: DataValue[]): { type: "numeric" | "categorical"; format: NumberFormat } {
  const present = values.filter((value) => value !== null && String(value).trim() !== "");
  const format = inferNumberFormat(present);
  const numeric = present.length > 0 && !present.some(looksLikeCode) &&
    present.every((value) => parseLocalizedNumber(value, format) !== null);
  return { type: numeric ? "numeric" : "categorical", format };
}

async function readExcelRows(file: File): Promise<Array<Array<unknown>>> {
  const worker = new Worker(new URL("./excel.worker.ts", import.meta.url), { type: "module" });
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<{ rows?: Array<Array<unknown>>; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.rows ?? []);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "The Excel workbook could not be read."));
    };
    worker.postMessage(buffer, [buffer]);
  });
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
  const inferredTypes: ParsedDataset["inferredTypes"] = {};
  const numberFormats: ParsedDataset["numberFormats"] = {};
  columns.forEach((column, columnIndex) => {
    const inference = inferColumn(rows.map((row) => row[columnIndex]));
    inferredTypes[column] = inference.type;
    numberFormats[column] = inference.format;
    if (inference.type === "numeric") {
      rows.forEach((row) => {
        if (row[columnIndex] !== null && String(row[columnIndex]).trim() !== "") {
          row[columnIndex] = parseLocalizedNumber(row[columnIndex], inference.format);
        }
      });
    }
  });
  return { fileName, columns, rows, inferredTypes, numberFormats, variableTypes: {} };
}

export async function parseDatasetFile(file: File): Promise<ParsedDataset> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error("Choose a .csv or .xlsx file.");
  }

  if (extension === "xlsx") {
    const rows = await readExcelRows(file);
    return { ...normalizeTable(rows, file.name), fileSize: file.size, fileLastModified: file.lastModified };
  }

  const text = await file.text();
  const result = Papa.parse<Array<string | null>>(text, {
    skipEmptyLines: "greedy",
  });
  if (result.errors.length > 0) {
    throw new Error(`CSV parsing failed: ${result.errors[0].message}`);
  }
  return { ...normalizeTable(result.data, file.name), fileSize: file.size, fileLastModified: file.lastModified };
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
    const numeric = parseLocalizedNumber(value, dataset.numberFormats?.[target]);
    if (numeric !== null && dataset.variableTypes?.[target] !== "categorical") numericValues.push(numeric);
    else allNumeric = false;
  }
  const configuredType = dataset.variableTypes?.[target] ?? dataset.inferredTypes?.[target];
  if (configuredType === "numeric") allNumeric = numericValues.length > 0;
  if (configuredType === "categorical") allNumeric = false;

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
