"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { Dataset, PromptTemplate, Run } from "@/lib/types";

const modelOptions = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fast default for batch evaluation runs." },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Stronger reasoning with higher latency and cost." },
];

const evaluatorOptions = [
  { value: "exact", label: "Exact Match", hint: "Strict normalized string equality." },
  { value: "semantic", label: "Semantic Similarity", hint: "Embedding similarity against expected output." },
  { value: "judge", label: "LLM Judge", hint: "Gemini judge for correctness and hallucination checks." },
];

function extractVariables(template: string) {
  return Array.from(new Set(Array.from(template.matchAll(/\{\{(\w+)\}\}/g)).map((match) => match[1]))).sort();
}

export function RunManager() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [promptId, setPromptId] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>(["exact", "semantic", "judge"]);
  const [status, setStatus] = useState("Loading runs...");

  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const selectedPrompt = prompts.find((prompt) => prompt.id === promptId);
  const promptVariables = selectedPrompt ? extractVariables(selectedPrompt.user_template) : [];
  const datasetFields = selectedDataset ? Object.keys(selectedDataset.schema || {}).sort() : [];
  const missingVariables = promptVariables.filter((variable) => !datasetFields.includes(variable));

  async function load(options?: { silent?: boolean }) {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      const [datasetData, promptData, runData] = await Promise.all([
        api.datasets(token),
        api.prompts(token),
        api.runs(token),
      ]);
      setDatasets(datasetData);
      setPrompts(promptData);
      setRuns(runData);
      setDatasetId((current) => current || datasetData[0]?.id || "");
      setPromptId((current) => current || promptData[0]?.id || "");
      if (!options?.silent) {
        setStatus(runData.length ? "" : "No runs yet.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load runs");
    }
  }

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load({ silent: true });
      }
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      if (!datasetId || !promptId) {
        setStatus("Choose a dataset and prompt before launching.");
        return;
      }
      if (!selectedEvaluators.length) {
        setStatus("Select at least one evaluator before launching.");
        return;
      }
      if (missingVariables.length) {
        setStatus(`Prompt variables missing from dataset schema: ${missingVariables.join(", ")}`);
        return;
      }
      setStatus("Launching run...");
      await api.createRun(token, {
        dataset_id: datasetId,
        prompt_template_id: promptId,
        model,
        evaluators: selectedEvaluators,
      });
      setStatus("Run queued.");
      await load({ silent: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to create run");
    }
  }

  async function seedDemo() {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      setStatus("Seeding demo data...");
      await api.seedDemo(token);
      setStatus("Demo dataset, prompt, and run created.");
      await load({ silent: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to seed demo");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel md:grid-cols-2">
        <div className="md:col-span-2 flex items-center justify-between gap-4">
          <h3 className="font-display text-3xl">Launch Evaluation Run</h3>
          <button className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm" onClick={seedDemo} type="button">
            Seed Demo Data
          </button>
        </div>
        <select className="rounded-2xl border border-slate-200 px-4 py-3" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
          <option value="">Select dataset</option>
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
        </select>
        <select className="rounded-2xl border border-slate-200 px-4 py-3" value={promptId} onChange={(e) => setPromptId(e.target.value)}>
          <option value="">Select prompt</option>
          {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.name} v{prompt.version}</option>)}
        </select>
        <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Model</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {modelOptions.map((option) => (
              <label
                key={option.value}
                className={`rounded-2xl border p-4 ${model === option.value ? "border-ink bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="model"
                  value={option.value}
                  checked={model === option.value}
                  onChange={(e) => setModel(e.target.value)}
                />
                <p className="font-medium text-slate-900">{option.label}</p>
                <p className="mt-1 text-sm text-slate-600">{option.hint}</p>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Evaluators</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {evaluatorOptions.map((option) => (
              <label
                key={option.value}
                className={`rounded-2xl border p-4 ${selectedEvaluators.includes(option.value) ? "border-ink bg-slate-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    className="mt-1"
                    type="checkbox"
                    checked={selectedEvaluators.includes(option.value)}
                    onChange={(e) =>
                      setSelectedEvaluators((current) =>
                        e.target.checked ? [...current, option.value] : current.filter((value) => value !== option.value),
                      )
                    }
                  />
                  <div>
                    <p className="font-medium text-slate-900">{option.label}</p>
                    <p className="mt-1 text-sm text-slate-600">{option.hint}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Launch Validation</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Dataset Fields</p>
              <p className="mt-2 text-sm text-slate-600">{datasetFields.length ? datasetFields.join(", ") : "Select a dataset to inspect schema fields."}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">Prompt Variables</p>
              <p className="mt-2 text-sm text-slate-600">{promptVariables.length ? promptVariables.map((value) => `{{${value}}}`).join(", ") : "Select a prompt to inspect variables."}</p>
            </div>
          </div>
          {missingVariables.length ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Missing dataset fields for prompt variables: {missingVariables.join(", ")}
            </p>
          ) : null}
        </div>
        <button className="w-fit rounded-full bg-ink px-5 py-3 text-white" type="submit">Launch Run</button>
        <p className="md:col-span-2 text-sm text-slate-500">{status}</p>
      </form>
      <section className="rounded-[28px] border border-black/5 bg-white/80 shadow-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rows</th>
              <th className="px-4 py-3">Failures</th>
              <th className="px-4 py-3">Score</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><Link href={`/runs/${run.id}`} className="text-ember">{run.id.slice(0, 8)}</Link></td>
                <td className="px-4 py-3">{run.model}</td>
                <td className="px-4 py-3 capitalize">{run.status}{run.status !== "completed" ? "..." : ""}</td>
                <td className="px-4 py-3">{run.processed_rows}/{run.total_rows}</td>
                <td className="px-4 py-3">{run.failed_rows}</td>
                <td className="px-4 py-3">{run.avg_score.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
