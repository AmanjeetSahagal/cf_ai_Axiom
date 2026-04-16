"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { DatasetTable } from "@/components/DatasetTable";
import { api } from "@/lib/api";
import { normalizeDatasetRows, parseCsvDataset, parseJsonDataset, validateDatasetRows } from "@/lib/dataset-upload";
import { Dataset, DatasetUploadRow, DatasetValidationIssue } from "@/lib/types";

const starterRows = [
  {
    input: {
      question: "What is Axiom?",
      context: "Axiom is an LLM evaluation platform for prompt, model, and regression analysis.",
    },
    expected_output: "Axiom is an LLM evaluation platform for prompt, model, and regression analysis.",
    category: "intro",
  },
];

export function DatasetManager() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [name, setName] = useState("Starter Dataset");
  const [schema, setSchema] = useState('{"question":"string","context":"string"}');
  const [rows, setRows] = useState(JSON.stringify(starterRows, null, 2));
  const [previewRows, setPreviewRows] = useState<DatasetUploadRow[]>(starterRows);
  const [validationIssues, setValidationIssues] = useState<DatasetValidationIssue[]>([]);
  const [loadedFileName, setLoadedFileName] = useState<string>("");
  const [status, setStatus] = useState("Loading datasets...");

  async function loadDatasets() {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      const data = await api.datasets(token);
      setDatasets(data);
      setStatus(data.length ? "" : "No datasets yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load datasets");
    }
  }

  useEffect(() => {
    void loadDatasets();
  }, []);

  useEffect(() => {
    try {
      const parsedRows = normalizeDatasetRows(JSON.parse(rows) as DatasetUploadRow[]);
      setPreviewRows(parsedRows);
      setValidationIssues(validateDatasetRows(parsedRows));
    } catch {
      setPreviewRows([]);
      setValidationIssues([{ row: 0, field: "rows", message: "Rows must be valid JSON before saving." }]);
    }
  }, [rows]);

  async function onFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = file.name.endsWith(".csv")
        ? parseCsvDataset(text)
        : parseJsonDataset(text);
      setRows(JSON.stringify(parsed.rows, null, 2));
      setSchema(JSON.stringify(parsed.schema, null, 2));
      setPreviewRows(parsed.rows);
      setValidationIssues(validateDatasetRows(parsed.rows));
      setName(file.name.replace(/\.(csv|json)$/i, ""));
      setLoadedFileName(file.name);
      setStatus(`Loaded ${parsed.rows.length} rows from ${file.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to parse file");
    } finally {
      event.target.value = "";
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      setStatus("Creating dataset...");
      const parsedRows = normalizeDatasetRows(JSON.parse(rows) as DatasetUploadRow[]);
      const issues = validateDatasetRows(parsedRows);
      if (issues.length) {
        setValidationIssues(issues);
        setStatus(`Dataset has ${issues.length} validation issue${issues.length === 1 ? "" : "s"}.`);
        return;
      }
      await api.createDataset(token, {
        name,
        schema: JSON.parse(schema),
        rows: parsedRows,
      });
      setPreviewRows(parsedRows);
      setStatus("Dataset created.");
      await loadDatasets();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create dataset");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <h3 className="font-display text-3xl">Create Dataset</h3>
        <label className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Upload CSV or JSON
          <input className="mt-3 block w-full" type="file" accept=".csv,.json,application/json,text/csv" onChange={onFileUpload} />
          {loadedFileName ? (
            <p className="mt-3 text-sm text-slate-700">
              Loaded file: <span className="font-medium">{loadedFileName}</span>
            </p>
          ) : null}
        </label>
        <input className="rounded-2xl border border-slate-200 px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="min-h-24 rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={schema} onChange={(e) => setSchema(e.target.value)} />
        <textarea className="min-h-64 rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={rows} onChange={(e) => setRows(e.target.value)} />
        <div className={`rounded-2xl border p-4 ${validationIssues.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Validation</p>
          <p className="mt-2 text-sm text-slate-700">
            {validationIssues.length
              ? `${validationIssues.length} issue${validationIssues.length === 1 ? "" : "s"} detected. Fix them before saving.`
              : "Dataset rows look valid."}
          </p>
          {validationIssues.length ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {validationIssues.slice(0, 5).map((issue, index) => (
                <li key={`${issue.row}-${issue.field}-${index}`}>
                  Row {issue.row}, `{issue.field}`: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preview</p>
          <p className="mt-2 text-sm text-slate-600">{previewRows.length} rows ready for import</p>
          {previewRows.length ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Question</th>
                    <th className="px-3 py-2 font-medium">Context</th>
                    <th className="px-3 py-2 font-medium">Expected</th>
                    <th className="px-3 py-2 font-medium">Model Output</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 3).map((row, index) => (
                    <tr key={index} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2">{String(row.input.question ?? "")}</td>
                      <td className="px-3 py-2">{String(row.input.context ?? "")}</td>
                      <td className="px-3 py-2">{row.expected_output ?? ""}</td>
                      <td className="px-3 py-2">{row.model_output ?? ""}</td>
                      <td className="px-3 py-2">{row.category ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <button className="btn-primary w-fit disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/80" type="submit" disabled={validationIssues.length > 0}>Save Dataset</button>
        <p className="text-sm text-slate-500">{status}</p>
      </form>
      <DatasetTable datasets={datasets} />
    </div>
  );
}
