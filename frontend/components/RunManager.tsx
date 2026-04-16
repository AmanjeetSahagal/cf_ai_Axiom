"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { Dataset, PromptTemplate, Run } from "@/lib/types";

const modelCatalog = [
  {
    provider: "OpenAI",
    models: [
      { value: "gpt-4.1", label: "GPT-4.1", hint: "Flagship general-purpose OpenAI model.", generatedAvailable: false },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", hint: "Smaller, cheaper OpenAI general model.", generatedAvailable: false },
      { value: "gpt-4o", label: "GPT-4o", hint: "Fast multimodal OpenAI model.", generatedAvailable: false },
    ],
  },
  {
    provider: "Anthropic",
    models: [
      { value: "claude-3.5-sonnet", label: "Claude 3.5 Sonnet", hint: "Strong reasoning and writing model.", generatedAvailable: false },
      { value: "claude-3.7-sonnet", label: "Claude 3.7 Sonnet", hint: "Newer Anthropic Sonnet-class model.", generatedAvailable: false },
    ],
  },
  {
    provider: "Google",
    models: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Fast default for batch evaluation runs.", generatedAvailable: true },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Stronger reasoning with higher latency and cost.", generatedAvailable: true },
    ],
  },
  {
    provider: "Meta / OSS",
    models: [
      { value: "llama-3.1-8b", label: "Llama 3.1 8B", hint: "Open-weight small model for local or hosted runs.", generatedAvailable: false },
      { value: "llama-3.1-70b", label: "Llama 3.1 70B", hint: "Open-weight larger model for stronger quality.", generatedAvailable: false },
    ],
  },
  {
    provider: "Mistral",
    models: [
      { value: "mistral-large", label: "Mistral Large", hint: "High-quality commercial Mistral model.", generatedAvailable: false },
      { value: "mixtral-8x7b", label: "Mixtral 8x7B", hint: "Popular mixture-of-experts open model.", generatedAvailable: false },
    ],
  },
];

const evaluatorOptions = [
  { value: "exact", label: "Exact Match", hint: "Strict normalized string equality." },
  { value: "semantic", label: "Semantic Similarity", hint: "Embedding similarity against expected output." },
  { value: "judge", label: "LLM Judge", hint: "Gemini judge for correctness and hallucination checks." },
];

function extractVariables(template: string) {
  return Array.from(new Set(Array.from(template.matchAll(/\{\{(\w+)\}\}/g)).map((match) => match[1]))).sort();
}

const allModels = modelCatalog.flatMap((group) => group.models);

export function RunManager() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [promptId, setPromptId] = useState("");
  const [runType, setRunType] = useState<"generated" | "imported">("generated");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>(["exact", "semantic", "judge"]);
  const [status, setStatus] = useState("Loading runs...");

  const selectedDataset = datasets.find((dataset) => dataset.id === datasetId);
  const selectedPrompt = prompts.find((prompt) => prompt.id === promptId);
  const promptVariables = selectedPrompt ? extractVariables(selectedPrompt.user_template) : [];
  const datasetFields = selectedDataset ? Object.keys(selectedDataset.schema || {}).sort() : [];
  const hasImportedOutputs = Boolean(selectedDataset?.rows.some((row) => row.model_output));
  const missingVariables = promptVariables.filter((variable) => !datasetFields.includes(variable));
  const selectedModel = allModels.find((option) => option.value === model);

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
      if (!datasetId) {
        setStatus("Choose a dataset before launching.");
        return;
      }
      if (runType === "generated" && !promptId) {
        setStatus("Choose a prompt before launching a generated run.");
        return;
      }
      if (!selectedEvaluators.length) {
        setStatus("Select at least one evaluator before launching.");
        return;
      }
      if (runType === "generated" && missingVariables.length) {
        setStatus(`Prompt variables missing from dataset schema: ${missingVariables.join(", ")}`);
        return;
      }
      if (runType === "imported" && !hasImportedOutputs) {
        setStatus("Imported runs require dataset rows with model_output.");
        return;
      }
      if (runType === "generated" && !selectedModel?.generatedAvailable) {
        setStatus("That model is currently available for imported runs only. Generated runs are wired only for Gemini right now.");
        return;
      }
      setStatus("Launching run...");
      await api.createRun(token, {
        dataset_id: datasetId,
        prompt_template_id: runType === "generated" ? promptId : null,
        model,
        run_type: runType,
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

  async function deleteRun(runId: string) {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    if (!window.confirm(`Delete run ${runId.slice(0, 8)}? This cannot be undone.`)) {
      return;
    }
    try {
      setStatus(`Deleting run ${runId.slice(0, 8)}...`);
      await api.deleteRun(token, runId);
      setStatus("Run deleted.");
      await load({ silent: true });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to delete run");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel md:grid-cols-2">
        <div className="md:col-span-2 flex items-center justify-between gap-4">
          <h3 className="font-display text-3xl">Launch Evaluation Run</h3>
          <button className="btn-secondary text-sm" onClick={seedDemo} type="button">
            Seed Demo Data
          </button>
        </div>
        <div className="grid gap-4 md:col-span-2 md:grid-cols-3">
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={datasetId} onChange={(e) => setDatasetId(e.target.value)}>
            <option value="">Select dataset</option>
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}
          </select>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={runType} onChange={(e) => setRunType(e.target.value as "generated" | "imported")}>
            <option value="generated">Generated Run</option>
            <option value="imported">Imported Run</option>
          </select>
          <select className="w-full rounded-2xl border border-slate-200 px-4 py-3" value={promptId} onChange={(e) => setPromptId(e.target.value)} disabled={runType === "imported"}>
            <option value="">Select prompt</option>
            {prompts.map((prompt) => <option key={prompt.id} value={prompt.id}>{prompt.name} v{prompt.version}</option>)}
          </select>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Model</p>
          <div className="mt-3 space-y-4">
            {modelCatalog.map((group) => (
              <div key={group.provider} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{group.provider}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {group.models.map((option) => {
                    const importOnly = runType === "generated" && !option.generatedAvailable;
                    return (
                      <label
                        key={option.value}
                        className={`rounded-2xl border p-4 ${
                          model === option.value ? "border-ink bg-white" : "border-slate-200 bg-white"
                        } ${importOnly ? "opacity-70" : ""}`}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="model"
                          value={option.value}
                          checked={model === option.value}
                          onChange={(e) => setModel(e.target.value)}
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{option.label}</p>
                          <span className={`rounded-full px-2 py-1 text-[11px] ${
                            option.generatedAvailable ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {option.generatedAvailable ? "generated + imported" : "import only"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{option.hint}</p>
                        <p className="mt-2 font-mono text-xs text-slate-500">{option.value}</p>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Generated runs are currently wired for Gemini models. The broader catalog is available for imported runs now and future provider integrations later.
          </p>
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
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Run Mode</p>
          <p className="mt-2 text-sm text-slate-600">
            {runType === "generated"
              ? "Axiom will render prompts and call the selected model."
              : "Axiom will skip generation and evaluate each row's imported model_output directly."}
          </p>
          {runType === "imported" && !hasImportedOutputs ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This dataset does not currently include any imported model outputs.
            </p>
          ) : null}
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
          {runType === "generated" && missingVariables.length ? (
            <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Missing dataset fields for prompt variables: {missingVariables.join(", ")}
            </p>
          ) : null}
        </div>
        <button className="btn-primary w-fit" type="submit">Launch Run</button>
        <p className="md:col-span-2 text-sm text-slate-500">{status}</p>
      </form>
      <section className="rounded-[28px] border border-black/5 bg-white/80 shadow-panel">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink text-white">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Model</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rows</th>
              <th className="px-4 py-3">Failures</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><Link href={`/runs/${run.id}`} className="text-ember">{run.id.slice(0, 8)}</Link></td>
                <td className="px-4 py-3 capitalize">{run.run_type}</td>
                <td className="px-4 py-3">{run.model}</td>
                <td className="px-4 py-3 capitalize">{run.status}{run.status !== "completed" ? "..." : ""}</td>
                <td className="px-4 py-3">{run.processed_rows}/{run.total_rows}</td>
                <td className="px-4 py-3">{run.failed_rows}</td>
                <td className="px-4 py-3">{run.avg_score.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <button
                    className="btn-danger text-xs"
                    type="button"
                    onClick={() => void deleteRun(run.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
