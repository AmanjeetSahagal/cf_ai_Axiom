"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { DatasetTable } from "@/components/DatasetTable";
import { api } from "@/lib/api";
import {
  datasetImportSummary,
  getImportedModelName,
  getImportedProvider,
  normalizeDatasetRows,
  parseCsvDataset,
  parseJsonDataset,
  validateDatasetRows,
} from "@/lib/dataset-upload";
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
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [datasetPage, setDatasetPage] = useState(1);
  const [datasetBrowserStatus, setDatasetBrowserStatus] = useState("");
  const [name, setName] = useState("Starter Dataset");
  const [schema, setSchema] = useState('{"question":"string","context":"string"}');
  const [rows, setRows] = useState(JSON.stringify(starterRows, null, 2));
  const [previewRows, setPreviewRows] = useState<DatasetUploadRow[]>(starterRows);
  const [validationIssues, setValidationIssues] = useState<DatasetValidationIssue[]>([]);
  const [loadedFileName, setLoadedFileName] = useState<string>("");
  const [status, setStatus] = useState("Loading datasets...");
  const importSummary = datasetImportSummary(previewRows);

  async function loadDatasets() {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      const data = await api.datasets(token);
      setDatasets(data);
      const nextSelectedId = selectedDatasetId && data.some((dataset) => dataset.id === selectedDatasetId)
        ? selectedDatasetId
        : data[0]?.id ?? null;
      setSelectedDatasetId(nextSelectedId);
      setStatus(data.length ? "" : "No datasets yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load datasets");
    }
  }

  useEffect(() => {
    void loadDatasets();
  }, []);

  useEffect(() => {
    if (!selectedDatasetId) {
      setSelectedDataset(null);
      setDatasetBrowserStatus(datasets.length ? "Select a dataset to inspect its rows." : "No datasets yet.");
      return;
    }

    let cancelled = false;

    async function loadDatasetPage() {
      const token = window.localStorage.getItem("axiom-token");
      const datasetId = selectedDatasetId;
      if (!token) {
        if (!cancelled) {
          setDatasetBrowserStatus("Login required.");
        }
        return;
      }
      if (!datasetId) {
        return;
      }
      try {
        setDatasetBrowserStatus("Loading dataset rows...");
        const data = await api.dataset(token, datasetId, { page: datasetPage, page_size: 10 });
        if (!cancelled) {
          setSelectedDataset(data);
          setDatasetBrowserStatus("");
        }
      } catch (error) {
        if (!cancelled) {
          setDatasetBrowserStatus(error instanceof Error ? error.message : "Failed to load dataset rows");
        }
      }
    }

    void loadDatasetPage();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, datasetPage, datasets.length]);

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
      setDatasetPage(1);
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
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Imported Outputs</p>
            <p className="mt-2 font-display text-3xl text-ink">{importSummary.importedRows}</p>
            <p className="mt-2 text-sm text-slate-600">
              {importSummary.importedRows
                ? "This dataset can launch imported runs immediately."
                : "Add a model_output column to evaluate external outputs."}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Providers Found</p>
            <p className="mt-2 font-display text-3xl text-ink">{importSummary.providerCount}</p>
            <p className="mt-2 text-sm text-slate-600">Detected from optional `provider` input fields.</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Models Found</p>
            <p className="mt-2 font-display text-3xl text-ink">{importSummary.modelCount}</p>
            <p className="mt-2 text-sm text-slate-600">Detected from `model_name`, `model`, or `model_id`.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preview</p>
          <p className="mt-2 text-sm text-slate-600">{previewRows.length} rows ready for import</p>
          <p className="mt-2 text-sm text-slate-500">
            Imported runs recognize `model_output` plus optional `provider` and `model_name` columns.
          </p>
          {previewRows.length ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Model</th>
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
                      <td className="px-3 py-2">{getImportedProvider(row) ?? "—"}</td>
                      <td className="px-3 py-2">{getImportedModelName(row) ?? "—"}</td>
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
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Dataset Browser</p>
            <h3 className="mt-2 font-display text-3xl text-ink">Inspect stored datasets and page through their rows.</h3>
          </div>
          {selectedDataset ? (
            <div className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-panel">
              Showing page {selectedDataset.page ?? datasetPage} of {selectedDataset.total_pages ?? 1}
            </div>
          ) : null}
        </div>
        <DatasetTable
          datasets={datasets}
          selectedDatasetId={selectedDatasetId}
          onSelect={(dataset) => {
            setSelectedDatasetId(dataset.id);
            setDatasetPage(1);
          }}
        />
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Selected Dataset</p>
              <h4 className="mt-2 font-display text-2xl text-ink">{selectedDataset?.name ?? "No dataset selected"}</h4>
              <p className="mt-2 text-sm text-slate-600">
                {selectedDataset
                  ? `${selectedDataset.row_count} total rows • ${selectedDataset.imported_output_count} imported outputs`
                  : "Choose a dataset above to inspect its rows."}
              </p>
            </div>
            {selectedDataset ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={(selectedDataset.page ?? 1) <= 1}
                  onClick={() => setDatasetPage((value) => Math.max(1, value - 1))}
                >
                  Previous Page
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={(selectedDataset.page ?? 1) >= (selectedDataset.total_pages ?? 1)}
                  onClick={() => setDatasetPage((value) => Math.min(selectedDataset.total_pages ?? 1, value + 1))}
                >
                  Next Page
                </button>
              </div>
            ) : null}
          </div>
          {selectedDataset ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Rows</p>
                <p className="mt-2 font-display text-3xl text-ink">{selectedDataset.row_count}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Imported Outputs</p>
                <p className="mt-2 font-display text-3xl text-ink">{selectedDataset.imported_output_count}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Schema</p>
                <p className="mt-2 break-words font-mono text-xs text-slate-600">{JSON.stringify(selectedDataset.schema)}</p>
              </div>
            </div>
          ) : null}
          {datasetBrowserStatus ? <p className="mt-4 text-sm text-slate-500">{datasetBrowserStatus}</p> : null}
          {selectedDataset?.rows?.length ? (
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Provider</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Input</th>
                    <th className="px-4 py-3 font-medium">Expected</th>
                    <th className="px-4 py-3 font-medium">Model Output</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDataset.rows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 text-slate-600">{getImportedProvider(row) ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{getImportedModelName(row) ?? "—"}</td>
                      <td className="px-4 py-3">
                        <pre className="whitespace-pre-wrap text-xs text-slate-700">
                          {JSON.stringify(row.input, null, 2)}
                        </pre>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.expected_output ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.model_output ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.category ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : selectedDataset && !datasetBrowserStatus ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              No rows found on this page.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
