import { DatasetUploadRow } from "@/lib/types";

function inferSchema(rows: DatasetUploadRow[]): Record<string, unknown> {
  const keys = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row.input).forEach((key) => keys.add(key));
  });
  return Object.fromEntries(Array.from(keys).sort().map((key) => [key, "string"]));
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

export function parseCsvDataset(text: string): { rows: DatasetUploadRow[]; schema: Record<string, unknown> } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.");
  }
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const { expected_output, category, ...input } = record;
    return {
      input,
      expected_output: expected_output || null,
      category: category || null,
    };
  });
  return { rows, schema: inferSchema(rows) };
}

export function parseJsonDataset(text: string): { rows: DatasetUploadRow[]; schema: Record<string, unknown> } {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("JSON dataset must be an array of objects.");
  }
  const rows: DatasetUploadRow[] = parsed.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each JSON row must be an object.");
    }
    const record = item as Record<string, unknown>;
    const { expected_output, category, ...input } = record;
    return {
      input,
      expected_output: typeof expected_output === "string" ? expected_output : null,
      category: typeof category === "string" ? category : null,
    };
  });
  return { rows, schema: inferSchema(rows) };
}
