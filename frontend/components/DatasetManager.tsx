"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";

import { DatasetTable } from "@/components/DatasetTable";
import { api } from "@/lib/api";
import { parseCsvDataset, parseJsonDataset } from "@/lib/dataset-upload";
import { Dataset, DatasetUploadRow } from "@/lib/types";

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
      const parsedRows = JSON.parse(rows) as DatasetUploadRow[];
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
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Preview</p>
          <p className="mt-2 text-sm text-slate-600">{previewRows.length} rows ready for import</p>
          {previewRows[0] ? (
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-xs">
              {JSON.stringify(previewRows[0], null, 2)}
            </pre>
          ) : null}
        </div>
        <button className="w-fit rounded-full bg-ink px-5 py-3 text-white" type="submit">Save Dataset</button>
        <p className="text-sm text-slate-500">{status}</p>
      </form>
      <DatasetTable datasets={datasets} />
    </div>
  );
}
