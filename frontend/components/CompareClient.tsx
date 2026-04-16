"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ComparisonChart } from "@/components/ComparisonChart";
import { MetricCard } from "@/components/MetricCard";
import { api } from "@/lib/api";
import { Comparison, Run } from "@/lib/types";

function formatNumber(value: unknown, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "0.00";
}

export function CompareClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [baselineRunId, setBaselineRunId] = useState("");
  const [candidateRunId, setCandidateRunId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [status, setStatus] = useState("Loading runs...");

  const baselineRun = runs.find((run) => run.id === baselineRunId);
  const candidateRun = runs.find((run) => run.id === candidateRunId);

  useEffect(() => {
    async function load() {
      const token = window.localStorage.getItem("axiom-token");
      if (!token) {
        setStatus("Login required.");
        return;
      }
      try {
        const data = await api.runs(token);
        setRuns(data);
        setBaselineRunId(data[0]?.id || "");
        setCandidateRunId(data[1]?.id || data[0]?.id || "");
        setStatus(data.length >= 2 ? "Choose two runs to compare." : "Create at least two runs to compare.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to load runs");
      }
    }

    void load();
  }, []);

  async function onCompare() {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      setStatus("Comparing runs...");
      const data = await api.compare(token, baselineRunId, candidateRunId);
      setComparison(data);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to compare runs");
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel md:grid-cols-[1fr,1fr,auto]">
        <select className="rounded-2xl border border-slate-200 px-4 py-3" value={baselineRunId} onChange={(e) => setBaselineRunId(e.target.value)}>
          <option value="">Select baseline run</option>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.id.slice(0, 8)} · {run.model}</option>)}
        </select>
        <select className="rounded-2xl border border-slate-200 px-4 py-3" value={candidateRunId} onChange={(e) => setCandidateRunId(e.target.value)}>
          <option value="">Select candidate run</option>
          {runs.map((run) => <option key={run.id} value={run.id}>{run.id.slice(0, 8)} · {run.model}</option>)}
        </select>
        <button className="btn-primary" type="button" onClick={onCompare}>Compare</button>
        <p className="md:col-span-3 text-sm text-slate-500">{status}</p>
      </section>
      {comparison ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Score Delta" value={comparison.score_delta.toFixed(2)} />
            <MetricCard label="Latency Delta" value={`${comparison.latency_delta.toFixed(0)} ms`} />
            <MetricCard label="Cost Delta" value={`$${comparison.cost_delta.toFixed(4)}`} />
            <MetricCard label="Failed Rows Delta" value={`${comparison.failed_rows_delta >= 0 ? "+" : ""}${comparison.failed_rows_delta}`} hint={`${comparison.baseline_failed_rows} → ${comparison.candidate_failed_rows}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Baseline</p>
              <h3 className="mt-2 font-display text-2xl text-ink">{baselineRun?.model ?? "Unknown model"}</h3>
              <p className="mt-2 text-sm text-slate-600">Run {comparison.baseline_run_id.slice(0, 8)} · {baselineRun?.status ?? "unknown"}</p>
              <Link className="btn-secondary mt-4 inline-block text-sm" href={`/runs/${comparison.baseline_run_id}`}>
                Open Baseline Run
              </Link>
            </div>
            <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Candidate</p>
              <h3 className="mt-2 font-display text-2xl text-ink">{candidateRun?.model ?? "Unknown model"}</h3>
              <p className="mt-2 text-sm text-slate-600">Run {comparison.candidate_run_id.slice(0, 8)} · {candidateRun?.status ?? "unknown"}</p>
              <Link className="btn-secondary mt-4 inline-block text-sm" href={`/runs/${comparison.candidate_run_id}`}>
                Open Candidate Run
              </Link>
            </div>
          </div>
          <ComparisonChart comparison={comparison} />
          <section className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
            <h3 className="font-display text-2xl">Category Detail</h3>
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Baseline Score</th>
                    <th className="px-4 py-3 font-medium">Candidate Score</th>
                    <th className="px-4 py-3 font-medium">Delta</th>
                    <th className="px-4 py-3 font-medium">Rows</th>
                    <th className="px-4 py-3 font-medium">Failed Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(comparison.category_breakdown).map(([category, values]) => {
                    const legacyValues = values as typeof values & { baseline?: number; candidate?: number };
                    const baselineScore = values.baseline_score ?? legacyValues.baseline ?? 0;
                    const candidateScore = values.candidate_score ?? legacyValues.candidate ?? 0;

                    return (
                      <tr key={category} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3 font-medium text-slate-800">{category}</td>
                        <td className="px-4 py-3">{formatNumber(baselineScore)}</td>
                        <td className="px-4 py-3">{formatNumber(candidateScore)}</td>
                        <td className={`px-4 py-3 ${typeof values.delta === "number" && values.delta >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                          {typeof values.delta === "number" && values.delta >= 0 ? "+" : ""}{formatNumber(values.delta)}
                        </td>
                        <td className="px-4 py-3">{values.baseline_count ?? 0} → {values.candidate_count ?? 0}</td>
                        <td className="px-4 py-3">{values.baseline_failed ?? 0} → {values.candidate_failed ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
