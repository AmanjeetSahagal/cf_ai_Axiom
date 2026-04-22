"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { MetricCard } from "@/components/MetricCard";
import { api } from "@/lib/api";
import { DashboardData } from "@/lib/types";

const palette = ["#C7512D", "#0F4C3A", "#D4A72C", "#7C4D2D", "#7A8798"];

type DrilldownState = {
  model?: string;
  provider?: string;
  runType?: "generated" | "imported";
  category?: string;
};

function getScopeTitle(drilldown: DrilldownState) {
  if (drilldown.model) return drilldown.model;
  if (drilldown.provider) return `${drilldown.provider} models`;
  if (drilldown.category) return `${drilldown.category} rows`;
  if (drilldown.runType) return `${drilldown.runType} runs`;
  return "All models";
}

function getScopeDescription(drilldown: DrilldownState) {
  const parts = [
    drilldown.model ? "specific model selected" : null,
    drilldown.provider ? `provider ${drilldown.provider}` : null,
    drilldown.runType ? `${drilldown.runType} runs only` : null,
    drilldown.category ? `category ${drilldown.category}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" • ") : "No drilldown active. Click any model, provider, run type, or category below to focus the dashboard.";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDelta(current: number, baseline: number, suffix = "") {
  const delta = current - baseline;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}${suffix}`;
}

export function RunDashboard() {
  const [windowDays, setWindowDays] = useState<"all" | "7" | "30">("all");
  const [drilldown, setDrilldown] = useState<DrilldownState>({});
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [baselineDashboard, setBaselineDashboard] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState("Loading dashboard...");

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
        const window_days = windowDays === "all" ? undefined : Number(windowDays);
        const [data, baseline] = await Promise.all([
          api.dashboard(token, {
            window_days,
            model: drilldown.model,
            provider: drilldown.provider,
            run_type: drilldown.runType,
            category: drilldown.category,
          }),
          api.dashboard(token, {
            window_days,
          }),
        ]);
        if (!cancelled) {
          setDashboard(data);
          setBaselineDashboard(baseline);
          setStatus(data.total_runs ? "" : "No runs yet. Seed demo data or launch one.");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "Failed to load dashboard");
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [windowDays, drilldown]);

  const activeFilters = useMemo(
    () =>
      [
        drilldown.model ? { key: "model", label: `Model: ${drilldown.model}` } : null,
        drilldown.provider ? { key: "provider", label: `Provider: ${drilldown.provider}` } : null,
        drilldown.runType ? { key: "runType", label: `Run Type: ${drilldown.runType}` } : null,
        drilldown.category ? { key: "category", label: `Category: ${drilldown.category}` } : null,
      ].filter(Boolean) as { key: keyof DrilldownState; label: string }[],
    [drilldown],
  );

  if (!dashboard) {
    return <div className="rounded-[28px] border border-black/5 bg-white/80 p-8 shadow-panel">{status}</div>;
  }
  const baseline = baselineDashboard ?? dashboard;

  const bestModel = dashboard.model_breakdown[0];
  const topProvider = dashboard.provider_breakdown[0];
  const totalStatusRuns = dashboard.pass_breakdown.reduce((sum, item) => sum + item.value, 0);
  const totalRunTypeRuns = dashboard.run_type_breakdown.reduce((sum, item) => sum + item.value, 0);
  const scopeTitle = getScopeTitle(drilldown);
  const scopeDescription = getScopeDescription(drilldown);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Overview</p>
          <h2 className="mt-2 font-display text-4xl text-ink">Performance across models and run types.</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "All Time" },
            { value: "30", label: "30 Days" },
            { value: "7", label: "7 Days" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWindowDays(option.value as typeof windowDays)}
              className={windowDays === option.value ? "btn-chip-active text-sm" : "btn-chip text-sm"}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-[30px] border border-ember/15 bg-[#fff8f4] p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-ember/80">Current View</p>
            <h3 className="mt-2 font-display text-3xl text-ink">{scopeTitle}</h3>
            <p className="mt-2 text-sm text-slate-600">{scopeDescription}</p>
          </div>
          <div className="grid min-w-[220px] gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-ember/10 bg-white/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Runs In View</p>
              <p className="mt-2 font-display text-3xl text-ink">{dashboard.total_runs}</p>
            </div>
            <div className="rounded-2xl border border-ember/10 bg-white/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Average Score</p>
              <p className="mt-2 font-display text-3xl text-ink">{dashboard.avg_score.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeFilters.length ? activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="btn-chip-active text-sm"
              onClick={() => setDrilldown((current) => ({ ...current, [filter.key]: undefined }))}
            >
              {filter.label}
            </button>
          )) : (
            <p className="text-sm text-slate-500">Showing the full dashboard.</p>
          )}
          {activeFilters.length ? (
            <button type="button" className="btn-secondary text-sm" onClick={() => setDrilldown({})}>
              Reset Dashboard View
            </button>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current View Metrics</p>
              <h3 className="mt-2 font-display text-2xl text-ink">
                {activeFilters.length ? `Metrics for ${scopeTitle}` : "Metrics for all runs in the selected time window"}
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                These top numbers are for the active dashboard slice, not a hidden average across unrelated models.
              </p>
            </div>
            {activeFilters.length ? (
              <div className="rounded-2xl border border-ember/10 bg-[#fff8f4] px-4 py-3 text-sm text-slate-600">
                Comparing against all runs in the same time window
              </div>
            ) : null}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Current Score"
              value={dashboard.avg_score.toFixed(2)}
              hint={activeFilters.length ? `${formatDelta(dashboard.avg_score, baseline.avg_score)} vs all runs` : "Average score in current view"}
            />
            <MetricCard
              label="Current Pass Rate"
              value={formatPercent((dashboard.pass_breakdown[0]?.value ?? 0) / Math.max(dashboard.total_runs, 1))}
              hint={activeFilters.length ? `${formatPercent((dashboard.pass_breakdown[0]?.value ?? 0) / Math.max(dashboard.total_runs, 1) - (baseline.pass_breakdown[0]?.value ?? 0) / Math.max(baseline.total_runs, 1))} vs all runs` : `${dashboard.total_runs} runs in view`}
            />
            <MetricCard
              label="Current Latency"
              value={`${dashboard.avg_latency.toFixed(0)} ms`}
              hint={activeFilters.length ? `${formatDelta(dashboard.avg_latency, baseline.avg_latency, " ms")} vs all runs` : "Average latency in current view"}
            />
            <MetricCard
              label="Current Failure"
              value={formatPercent(dashboard.failure_rate)}
              hint={activeFilters.length ? `${formatPercent(dashboard.failure_rate - baseline.failure_rate)} vs all runs` : `Total cost $${dashboard.total_cost.toFixed(4)}`}
            />
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-slate-50/90 p-5 shadow-panel">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">All Runs Baseline</p>
          <h3 className="mt-2 font-display text-2xl text-ink">Time-window benchmark</h3>
          <p className="mt-2 text-sm text-slate-500">
            Use this as context, not the main decision metric. It blends every model and run in the selected time range.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">All Run Score</p>
              <p className="mt-2 font-display text-3xl text-ink">{baseline.avg_score.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">All Run Latency</p>
              <p className="mt-2 font-display text-3xl text-ink">{baseline.avg_latency.toFixed(0)} ms</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">All Run Pass Rate</p>
              <p className="mt-2 font-display text-3xl text-ink">{formatPercent((baseline.pass_breakdown[0]?.value ?? 0) / Math.max(baseline.total_runs, 1))}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">All Runs</p>
              <p className="mt-2 font-display text-3xl text-ink">{baseline.total_runs}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Best Model In View" value={bestModel?.model ?? "None"} hint={bestModel ? `Avg score ${bestModel.avg_score.toFixed(2)}` : "No runs yet"} />
        <MetricCard label="Top Provider In View" value={topProvider?.provider ?? "None"} hint={topProvider ? `${topProvider.runs} runs in view` : "No runs yet"} />
        <MetricCard label="Generated In View" value={`${dashboard.run_type_breakdown.find((item) => item.name === "generated")?.value ?? 0}`} />
        <MetricCard label="Imported In View" value={`${dashboard.run_type_breakdown.find((item) => item.name === "imported")?.value ?? 0}`} />
      </div>
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Dashboard Controls</p>
            <h3 className="mt-2 font-display text-2xl text-ink">Choose what the rest of the dashboard is showing.</h3>
          </div>
          {activeFilters.length ? (
            <button type="button" className="btn-secondary text-sm" onClick={() => setDrilldown({})}>
              Clear Drilldowns
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeFilters.length ? activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className="btn-chip-active text-sm"
              onClick={() => setDrilldown((current) => ({ ...current, [filter.key]: undefined }))}
            >
              {filter.label}
            </button>
          )) : (
            <p className="text-sm text-slate-500">No drilldown filters active.</p>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Model Score Breakdown</h3>
          <p className="mt-2 text-sm text-slate-500">Pick a model to make it the primary dashboard focus.</p>
          <div className="mt-6 space-y-4">
            {dashboard.model_breakdown.length ? (
              dashboard.model_breakdown.slice(0, 8).map((entry) => (
                <button
                  key={entry.model}
                  type="button"
                  onClick={() => setDrilldown((current) => ({ ...current, model: entry.model }))}
                  className={`block w-full rounded-2xl border p-4 text-left transition ${
                    drilldown.model === entry.model
                      ? "border-ember bg-[#fff1e8] ring-2 ring-ember/15"
                      : "border-slate-100 bg-slate-50 hover:border-ember/30 hover:bg-[#fff8f4]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{entry.model}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {entry.runs} run{entry.runs === 1 ? "" : "s"} • {entry.avg_latency.toFixed(0)} ms avg latency
                      </p>
                    </div>
                    <p className="font-display text-3xl text-ink">{entry.avg_score.toFixed(2)}</p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-ember" style={{ width: `${Math.max(entry.avg_score * 100, 6)}%` }} />
                  </div>
                </button>
              ))
            ) : (
              <div className="flex h-80 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                No model runs are available in the current dashboard slice.
              </div>
            )}
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Run Status Mix</h3>
          <div className="mt-6 space-y-4">
            <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
              {dashboard.pass_breakdown.map((entry, index) => {
                const width = totalStatusRuns ? (entry.value / totalStatusRuns) * 100 : 0;
                return <div key={entry.name} style={{ width: `${width}%`, backgroundColor: palette[index % palette.length] }} />;
              })}
            </div>
            <div className="space-y-3">
              {dashboard.pass_breakdown.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: palette[index % palette.length] }} />
                    <span className="font-medium text-slate-900">{entry.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl text-ink">{entry.value}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {totalStatusRuns ? Math.round((entry.value / totalStatusRuns) * 100) : 0}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Provider Breakdown</h3>
          <p className="mt-2 text-sm text-slate-500">Use provider rows to swap the dashboard between OpenAI, Google, Anthropic, and others.</p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Provider</th>
                  <th className="px-4 py-3 font-medium">Runs</th>
                  <th className="px-4 py-3 font-medium">Avg Score</th>
                  <th className="px-4 py-3 font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.provider_breakdown.map((providerEntry) => (
                  <tr
                    key={providerEntry.provider}
                    className={`cursor-pointer border-t border-slate-100 ${
                      drilldown.provider === providerEntry.provider ? "bg-[#fff1e8]" : "hover:bg-[#fff8f4]"
                    }`}
                    onClick={() => setDrilldown((current) => ({ ...current, provider: providerEntry.provider }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{providerEntry.provider}</td>
                    <td className="px-4 py-3">{providerEntry.runs}</td>
                    <td className="px-4 py-3">{providerEntry.avg_score.toFixed(2)}</td>
                    <td className="px-4 py-3">${providerEntry.total_cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Run Type Mix</h3>
          <p className="mt-2 text-sm text-slate-500">Switch the whole dashboard between generated and imported runs.</p>
          <div className="mt-6 space-y-4">
            {dashboard.run_type_breakdown.length ? (
              dashboard.run_type_breakdown.map((entry, index) => {
                const width = totalRunTypeRuns ? (entry.value / totalRunTypeRuns) * 100 : 0;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => setDrilldown((current) => ({ ...current, runType: entry.name as "generated" | "imported" }))}
                    className={`block w-full rounded-2xl border p-4 text-left transition ${
                      drilldown.runType === entry.name
                        ? "border-ember bg-[#fff1e8] ring-2 ring-ember/15"
                        : "border-slate-100 bg-slate-50 hover:border-ember/30 hover:bg-[#fff8f4]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium capitalize text-slate-900">{entry.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {totalRunTypeRuns ? Math.round(width) : 0}% of runs in view
                        </p>
                      </div>
                      <p className="font-display text-3xl text-ink">{entry.value}</p>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(width, entry.value ? 8 : 0)}%`, backgroundColor: palette[index % palette.length] }}
                      />
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                No run types are available in the current dashboard slice.
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Model Detail</h3>
          <p className="mt-2 text-sm text-slate-500">This table mirrors the current dashboard view. The highlighted row is the model currently in focus.</p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium">Runs</th>
                  <th className="px-4 py-3 font-medium">Avg Score</th>
                  <th className="px-4 py-3 font-medium">Avg Latency</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.model_breakdown.map((entry) => (
                  <tr
                    key={entry.model}
                    className={`cursor-pointer border-t border-slate-100 ${
                      drilldown.model === entry.model ? "bg-[#fff1e8]" : "hover:bg-[#fff8f4]"
                    }`}
                    onClick={() => setDrilldown((current) => ({ ...current, model: entry.model }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.model}</td>
                    <td className="px-4 py-3">{entry.runs}</td>
                    <td className="px-4 py-3">{entry.avg_score.toFixed(2)}</td>
                    <td className="px-4 py-3">{entry.avg_latency.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Category Breakdown</h3>
          <p className="mt-2 text-sm text-slate-500">Click a category to focus the full dashboard on that slice of evaluation rows.</p>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Runs</th>
                  <th className="px-4 py-3 font-medium">Avg Score</th>
                  <th className="px-4 py-3 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.category_breakdown.slice(0, 8).map((entry) => (
                  <tr
                    key={entry.category}
                    className={`cursor-pointer border-t border-slate-100 ${
                      drilldown.category === entry.category ? "bg-[#fff1e8]" : "hover:bg-[#fff8f4]"
                    }`}
                    onClick={() => setDrilldown((current) => ({ ...current, category: entry.category }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{entry.category}</td>
                    <td className="px-4 py-3">{entry.rows}</td>
                    <td className="px-4 py-3">{entry.runs}</td>
                    <td className="px-4 py-3">{entry.avg_score.toFixed(2)}</td>
                    <td className="px-4 py-3">{entry.failed}</td>
                  </tr>
                ))}
                {!dashboard.category_breakdown.length ? (
                  <tr>
                    <td className="px-4 py-4 text-slate-500" colSpan={5}>No row-level category data yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Matching Runs</p>
            <h3 className="mt-2 font-display text-2xl text-ink">Runs inside the current dashboard slice.</h3>
          </div>
          <p className="text-sm text-slate-500">{dashboard.total_runs} run{dashboard.total_runs === 1 ? "" : "s"} in view</p>
        </div>
        <p className="mt-3 text-sm text-slate-500">If you are unsure what you are looking at, check the <span className="font-medium text-ink">Current View</span> band above. It always shows the active model, provider, run type, or category.</p>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.matching_runs.slice(0, 12).map((run) => (
                <tr key={run.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={`/runs/${run.id}`} className="text-ember">
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{run.model}</td>
                  <td className="px-4 py-3">{run.provider}</td>
                  <td className="px-4 py-3 capitalize">{run.run_type}</td>
                  <td className="px-4 py-3 capitalize">{run.status}</td>
                  <td className="px-4 py-3">{run.avg_score.toFixed(2)}</td>
                  <td className="px-4 py-3">{new Date(run.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!dashboard.matching_runs.length ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>No runs match the current drilldown.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {status ? <p className="text-sm text-slate-500">{status}</p> : null}
    </div>
  );
}
