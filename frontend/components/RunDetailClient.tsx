"use client";

import { useEffect, useState } from "react";

import { ResultInspector } from "@/components/ResultInspector";
import { api } from "@/lib/api";
import { Run } from "@/lib/types";

function getRunSummary(run: Run) {
  const results = run.results || [];
  const disagreements = results.filter((result) => new Set(result.scores.map((score) => score.passed)).size > 1).length;
  const hallucinations = results.filter((result) =>
    result.scores.some((score) => score.type === "judge" && Boolean(score.metadata?.hallucination)),
  ).length;
  return { disagreements, hallucinations };
}

export function RunDetailClient({ id }: { id: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState("Loading run...");

  async function exportResults(format: "json" | "csv", options?: { pretty?: boolean }) {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      const exportLabel = format === "json" && options?.pretty === false ? "compact JSON" : format.toUpperCase();
      setStatus(`Preparing ${exportLabel} export...`);
      const blob = await api.exportRun(token, id, format, options);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `run-${id}${format === "json" && options?.pretty === false ? ".compact" : ""}.${format}`;
      anchor.click();
      window.URL.revokeObjectURL(url);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Failed to export ${format}`);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = window.localStorage.getItem("axiom-token");
      if (!token) {
        if (!cancelled) {
          setStatus("Login required.");
        }
        return;
      }
      try {
        const data = await api.run(token, id);
        if (!cancelled) {
          setRun(data);
          if (data.status === "pending" || data.status === "running") {
            setStatus(`Run ${data.status}. Refreshing progress automatically...`);
          } else if (data.status === "failed") {
            setStatus(data.last_error || "Run failed.");
          } else {
            setStatus("");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to load run");
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id]);

  if (!run) {
    return <div className="rounded-[28px] border border-black/5 bg-white/80 p-8 shadow-panel">{status}</div>;
  }

  const summary = getRunSummary(run);

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Run Detail</p>
        <h2 className="mt-2 font-display text-4xl text-ink">{run.model}</h2>
        <p className="mt-3 text-slate-600">
          Status: {run.status} | Rows: {run.processed_rows}/{run.total_rows} | Failures: {run.failed_rows} | Average score: {run.avg_score.toFixed(2)}
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-ember transition-all"
            style={{ width: `${run.total_rows ? (run.processed_rows / run.total_rows) * 100 : 0}%` }}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Completed Rows</p>
            <p className="mt-2 font-display text-3xl">{run.processed_rows}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Disagreements</p>
            <p className="mt-2 font-display text-3xl">{summary.disagreements}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Judge Hallucinations</p>
            <p className="mt-2 font-display text-3xl">{summary.hallucinations}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-secondary text-sm" type="button" onClick={() => exportResults("json", { pretty: true })}>
            Export JSON
          </button>
          <button className="btn-secondary text-sm" type="button" onClick={() => exportResults("json", { pretty: false })}>
            Export Compact JSON
          </button>
          <button className="btn-secondary text-sm" type="button" onClick={() => exportResults("csv")}>
            Export CSV
          </button>
        </div>
        {status ? <p className="mt-3 text-sm text-slate-500">{status}</p> : null}
        {run.failed_rows > 0 ? (
          <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {run.failed_rows} row{run.failed_rows === 1 ? "" : "s"} failed during evaluation. Inspect the result cards below for row-level errors.
          </p>
        ) : null}
        {run.last_error ? (
          <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{run.last_error}</p>
        ) : null}
      </div>
      {run.results?.length ? (
        <ResultInspector results={run.results || []} />
      ) : (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-8 text-slate-500 shadow-panel">
          {run.status === "pending" || run.status === "running"
            ? "The worker has not persisted row results yet."
            : "No row results were stored for this run."}
        </div>
      )}
    </section>
  );
}
