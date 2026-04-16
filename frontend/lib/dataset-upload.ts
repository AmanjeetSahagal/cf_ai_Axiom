import { DatasetUploadRow, DatasetValidationIssue } from "@/lib/types";

export type ParsedDataset = {
  rows: DatasetUploadRow[];
  schema: Record<string, unknown>;
};

function inferSchema(rows: DatasetUploadRow[]): Record<string, unknown> {
  const keys = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row.input).forEach((key) => keys.add(key));
  });
  return Object.fromEntries(Array.from(keys).sort().map((key) => [key, "string"]));
}

export function getImportedProvider(row: DatasetUploadRow | Record<string, unknown> | null | undefined): string | null {
  const input = row && "input" in row ? (row.input as Record<string, unknown> | undefined) : undefined;
  const value = input?.provider;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getImportedModelName(row: DatasetUploadRow | Record<string, unknown> | null | undefined): string | null {
  const input = row && "input" in row ? (row.input as Record<string, unknown> | undefined) : undefined;
  const candidate = input?.model_name ?? input?.model ?? input?.model_id;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

export function datasetImportSummary(rows: DatasetUploadRow[]) {
  const importedRows = rows.filter((row) => row.model_output).length;
  const providerCount = new Set(rows.map((row) => getImportedProvider(row)).filter(Boolean)).size;
  const modelCount = new Set(rows.map((row) => getImportedModelName(row)).filter(Boolean)).size;
  return { importedRows, providerCount, modelCount };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeInputValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

export function normalizeDatasetRows(rows: DatasetUploadRow[]): DatasetUploadRow[] {
  return rows.map((row) => ({
    input: Object.fromEntries(
      Object.entries(row.input)
        .map(([key, value]) => [key, normalizeInputValue(value)])
        .filter(([, value]) => value !== null),
    ),
    expected_output: normalizeOptionalString(row.expected_output),
    model_output: normalizeOptionalString(row.model_output),
    category: normalizeOptionalString(row.category),
  }));
}

export function validateDatasetRows(rows: DatasetUploadRow[]): DatasetValidationIssue[] {
  const issues: DatasetValidationIssue[] = [];

  if (!rows.length) {
    issues.push({ row: 0, field: "rows", message: "Dataset must include at least one row." });
    return issues;
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;

    if (!row || typeof row !== "object" || Array.isArray(row)) {
      issues.push({ row: rowNumber, field: "row", message: "Row must be an object." });
      return;
    }

    if (!row.input || typeof row.input !== "object" || Array.isArray(row.input)) {
      issues.push({ row: rowNumber, field: "input", message: "Row input must be an object." });
      return;
    }

    const inputEntries = Object.entries(row.input);
    if (!inputEntries.length) {
      issues.push({ row: rowNumber, field: "input", message: "Row input must include at least one field." });
    }

    let hasNonEmptyInput = false;
    inputEntries.forEach(([field, value]) => {
      const normalized = normalizeInputValue(value);
      if (normalized === null) {
        issues.push({
          row: rowNumber,
          field: `input.${field}`,
          message: "Input values must be strings, numbers, or booleans, and cannot be blank.",
        });
        return;
      }
      hasNonEmptyInput = true;
    });

    if (!hasNonEmptyInput) {
      issues.push({ row: rowNumber, field: "input", message: "At least one input value must be non-empty." });
    }

    if (row.expected_output !== undefined && row.expected_output !== null && typeof row.expected_output !== "string") {
      issues.push({ row: rowNumber, field: "expected_output", message: "Expected output must be a string when provided." });
    }

    if (row.model_output !== undefined && row.model_output !== null && typeof row.model_output !== "string") {
      issues.push({ row: rowNumber, field: "model_output", message: "Model output must be a string when provided." });
    }

    if (row.category !== undefined && row.category !== null && typeof row.category !== "string") {
      issues.push({ row: rowNumber, field: "category", message: "Category must be a string when provided." });
    }
  });

  return issues;
}

export function parseCsvDataset(text: string): ParsedDataset {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const { expected_output, model_output, category, ...input } = record;
    return {
      input,
      expected_output: expected_output || null,
      model_output: model_output || null,
      category: category || null,
    };
  });
  const normalizedRows = normalizeDatasetRows(rows);
  return { rows: normalizedRows, schema: inferSchema(normalizedRows) };
}

export function parseJsonDataset(text: string): ParsedDataset {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON dataset must be an array of objects.");
  }
  const rows: DatasetUploadRow[] = parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each JSON row must be an object.");
    }
    const record = item as Record<string, unknown>;
    const { expected_output, model_output, category, ...input } = record;
    return {
      input,
      expected_output: typeof expected_output === "string" ? expected_output : null,
      model_output: typeof model_output === "string" ? model_output : null,
      category: typeof category === "string" ? category : null,
    };
  });
  const normalizedRows = normalizeDatasetRows(rows);
  return { rows: normalizedRows, schema: inferSchema(normalizedRows) };
}
