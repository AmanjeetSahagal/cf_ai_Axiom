"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MetricCard } from "@/components/MetricCard";
import { Run } from "@/lib/types";

const palette = ["#C7512D", "#0F4C3A", "#D4A72C", "#7C4D2D", "#7A8798"];

function getProvider(model: string) {
  if (model.startsWith("gpt-")) return "OpenAI";
  if (model.startsWith("claude-")) return "Anthropic";
  if (model.startsWith("gemini-")) return "Google";
  if (model.startsWith("llama-")) return "Meta / OSS";
  if (model.startsWith("mistral") || model.startsWith("mixtral-")) return "Mistral";
  return "Other";
}

function getRunLatency(run: Run) {
  const rowCount = run.results?.length ?? 0;
  return rowCount ? run.results!.reduce((sum, result) => sum + result.latency_ms, 0) / rowCount : 0;
}

type DrilldownState = {
  model?: string;
  provider?: string;
  runType?: string;
  category?: string;
};

export function RunDashboard({ runs }: { runs: Run[] }) {
  const [windowDays, setWindowDays] = useState<"all" | "7" | "30">("all");
  const [drilldown, setDrilldown] = useState<DrilldownState>({});

  const windowedRuns = useMemo(() => {
    if (windowDays === "all") {
      return runs;
    }
    const cutoff = Date.now() - Number(windowDays) * 24 * 60 * 60 * 1000;
    return runs.filter((run) => new Date(run.created_at).getTime() >= cutoff);
  }, [runs, windowDays]);

  const filteredRuns = useMemo(
    () =>
      windowedRuns.filter((run) => {
        if (drilldown.model && run.model !== drilldown.model) return false;
        if (drilldown.provider && getProvider(run.model) !== drilldown.provider) return false;
        if (drilldown.runType && run.run_type !== drilldown.runType) return false;
        if (
          drilldown.category &&
          !run.results?.some((result) => (result.category || "uncategorized") === drilldown.category)
        ) {
          return false;
        }
        return true;
      }),
    [drilldown, windowedRuns],
  );

  const {
    avgScore,
    totalCost,
    avgLatency,
    failureRate,
    passBreakdown,
    modelBreakdown,
    providerBreakdown,
    runTypeBreakdown,
    categoryBreakdown,
    bestModel,
    topProvider,
  } = useMemo(() => {
    const avgScoreValue = filteredRuns.length ? filteredRuns.reduce((sum, run) => sum + run.avg_score, 0) / filteredRuns.length : 0;
    const totalCostValue = filteredRuns.reduce((sum, run) => sum + run.total_cost, 0);
    const avgLatencyValue = filteredRuns.length
      ? filteredRuns.reduce((sum, run) => sum + getRunLatency(run), 0) / filteredRuns.length
      : 0;
    const failureRateValue = filteredRuns.length
      ? filteredRuns.reduce((sum, run) => sum + (run.total_rows ? run.failed_rows / run.total_rows : 0), 0) / filteredRuns.length
      : 0;

    const passData = [
      { name: "Completed", value: filteredRuns.filter((run) => run.status === "completed").length },
      { name: "In Flight", value: filteredRuns.filter((run) => run.status === "pending" || run.status === "running").length },
      { name: "Failed", value: filteredRuns.filter((run) => run.status === "failed").length },
    ];

    const modelMap = new Map<string, { runs: number; scoreSum: number; failureSum: number; latencySum: number }>();
    const providerMap = new Map<string, { runs: number; scoreSum: number; costSum: number }>();
    const runTypeMap = new Map<string, number>();
    const categoryMap = new Map<string, { rows: number; scoreSum: number; failed: number; runs: number }>();

    filteredRuns.forEach((run) => {
      const latency = getRunLatency(run);
      const provider = getProvider(run.model);
      const modelEntry = modelMap.get(run.model) ?? { runs: 0, scoreSum: 0, failureSum: 0, latencySum: 0 };
      modelEntry.runs += 1;
      modelEntry.scoreSum += run.avg_score;
      modelEntry.failureSum += run.total_rows ? run.failed_rows / run.total_rows : 0;
      modelEntry.latencySum += latency;
      modelMap.set(run.model, modelEntry);

      const providerEntry = providerMap.get(provider) ?? { runs: 0, scoreSum: 0, costSum: 0 };
      providerEntry.runs += 1;
      providerEntry.scoreSum += run.avg_score;
      providerEntry.costSum += run.total_cost;
      providerMap.set(provider, providerEntry);

      runTypeMap.set(run.run_type, (runTypeMap.get(run.run_type) ?? 0) + 1);

      const categoriesInRun = new Set<string>();
      run.results?.forEach((result) => {
        const category = result.category || "uncategorized";
        categoriesInRun.add(category);
        const judgeScore = result.scores.find((score) => score.type === "judge")?.score;
        const semanticScore = result.scores.find((score) => score.type === "semantic")?.score;
        const exactScore = result.scores.find((score) => score.type === "exact")?.score;
        const normalizedJudge = typeof judgeScore === "number" ? judgeScore / 5 : undefined;
        const scoreCandidates = [exactScore, semanticScore, normalizedJudge].filter((value): value is number => typeof value === "number");
        const avgRowScore = scoreCandidates.length ? scoreCandidates.reduce((sum, value) => sum + value, 0) / scoreCandidates.length : 0;
        const categoryEntry = categoryMap.get(category) ?? { rows: 0, scoreSum: 0, failed: 0, runs: 0 };
        categoryEntry.rows += 1;
        categoryEntry.scoreSum += avgRowScore;
        if (result.error_message) categoryEntry.failed += 1;
        categoryMap.set(category, categoryEntry);
      });
      categoriesInRun.forEach((category) => {
        const categoryEntry = categoryMap.get(category);
        if (categoryEntry) categoryEntry.runs += 1;
      });
    });

    const modelData = Array.from(modelMap.entries())
      .map(([model, value]) => ({
        model,
        runs: value.runs,
        avgScore: value.scoreSum / value.runs,
        avgFailureRate: value.failureSum / value.runs,
        avgLatency: value.latencySum / value.runs,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const providerData = Array.from(providerMap.entries())
      .map(([provider, value]) => ({
        provider,
        runs: value.runs,
        avgScore: value.scoreSum / value.runs,
        totalCost: value.costSum,
      }))
      .sort((a, b) => b.runs - a.runs);

    const runTypeData = Array.from(runTypeMap.entries()).map(([name, value]) => ({ name, value }));

    const categoryData = Array.from(categoryMap.entries())
      .map(([category, value]) => ({
        category,
        rows: value.rows,
        runs: value.runs,
        avgScore: value.rows ? value.scoreSum / value.rows : 0,
        failed: value.failed,
      }))
      .sort((a, b) => b.rows - a.rows);

    return {
      avgScore: avgScoreValue,
      totalCost: totalCostValue,
      avgLatency: avgLatencyValue,
      failureRate: failureRateValue,
      passBreakdown: passData,
      modelBreakdown: modelData,
      providerBreakdown: providerData,
      runTypeBreakdown: runTypeData,
      categoryBreakdown: categoryData,
      bestModel: modelData[0],
      topProvider: providerData[0],
    };
  }, [filteredRuns]);

  const activeFilters = [
    drilldown.model ? { key: "model", label: `Model: ${drilldown.model}` } : null,
    drilldown.provider ? { key: "provider", label: `Provider: ${drilldown.provider}` } : null,
    drilldown.runType ? { key: "runType", label: `Run Type: ${drilldown.runType}` } : null,
    drilldown.category ? { key: "category", label: `Category: ${drilldown.category}` } : null,
  ].filter(Boolean) as { key: keyof DrilldownState; label: string }[];

  const totalStatusRuns = passBreakdown.reduce((sum, item) => sum + item.value, 0);
  const totalRunTypeRuns = runTypeBreakdown.reduce((sum, item) => sum + item.value, 0);

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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Average Score" value={avgScore.toFixed(2)} hint="Normalized across filtered runs" />
        <MetricCard label="Run Pass Rate" value={`${Math.round((passBreakdown[0].value / Math.max(filteredRuns.length, 1)) * 100)}%`} hint={`${filteredRuns.length} runs in view`} />
        <MetricCard label="Average Latency" value={`${avgLatency.toFixed(0)} ms`} />
        <MetricCard label="Failure Rate" value={`${Math.round(failureRate * 100)}%`} hint={`Total cost $${totalCost.toFixed(4)}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Top Model" value={bestModel?.model ?? "None"} hint={bestModel ? `Avg score ${bestModel.avgScore.toFixed(2)}` : "No runs yet"} />
        <MetricCard label="Top Provider" value={topProvider?.provider ?? "None"} hint={topProvider ? `${topProvider.runs} runs in view` : "No runs yet"} />
        <MetricCard label="Generated Runs" value={`${runTypeBreakdown.find((item) => item.name === "generated")?.value ?? 0}`} />
        <MetricCard label="Imported Runs" value={`${runTypeBreakdown.find((item) => item.name === "imported")?.value ?? 0}`} />
      </div>
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Drill Down</p>
            <h3 className="mt-2 font-display text-2xl text-ink">Click a model, provider, run type, or category to focus the dashboard.</h3>
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
          <div className="mt-6 space-y-4">
            {modelBreakdown.length ? (
              modelBreakdown.slice(0, 8).map((entry) => (
                <button
                  key={entry.model}
                  type="button"
                  onClick={() => setDrilldown((current) => ({ ...current, model: entry.model }))}
                  className="block w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-ember/30 hover:bg-[#fff8f4]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{entry.model}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-500">
                        {entry.runs} run{entry.runs === 1 ? "" : "s"} • {entry.avgLatency.toFixed(0)} ms avg latency
                      </p>
                    </div>
                    <p className="font-display text-3xl text-ink">{entry.avgScore.toFixed(2)}</p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-ember" style={{ width: `${Math.max(entry.avgScore * 100, 6)}%` }} />
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
              {passBreakdown.map((entry, index) => {
                const width = totalStatusRuns ? (entry.value / totalStatusRuns) * 100 : 0;
                return <div key={entry.name} style={{ width: `${width}%`, backgroundColor: palette[index % palette.length] }} />;
              })}
            </div>
            <div className="space-y-3">
              {passBreakdown.map((entry, index) => (
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
                {providerBreakdown.map((provider) => (
                  <tr
                    key={provider.provider}
                    className="cursor-pointer border-t border-slate-100 hover:bg-[#fff8f4]"
                    onClick={() => setDrilldown((current) => ({ ...current, provider: provider.provider }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{provider.provider}</td>
                    <td className="px-4 py-3">{provider.runs}</td>
                    <td className="px-4 py-3">{provider.avgScore.toFixed(2)}</td>
                    <td className="px-4 py-3">${provider.totalCost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Run Type Mix</h3>
          <div className="mt-6 space-y-4">
            {runTypeBreakdown.length ? (
              runTypeBreakdown.map((entry, index) => {
                const width = totalRunTypeRuns ? (entry.value / totalRunTypeRuns) * 100 : 0;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    onClick={() => setDrilldown((current) => ({ ...current, runType: entry.name }))}
                    className="block w-full rounded-2xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-ember/30 hover:bg-[#fff8f4]"
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
                {modelBreakdown.map((model) => (
                  <tr
                    key={model.model}
                    className="cursor-pointer border-t border-slate-100 hover:bg-[#fff8f4]"
                    onClick={() => setDrilldown((current) => ({ ...current, model: model.model }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{model.model}</td>
                    <td className="px-4 py-3">{model.runs}</td>
                    <td className="px-4 py-3">{model.avgScore.toFixed(2)}</td>
                    <td className="px-4 py-3">{model.avgLatency.toFixed(0)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <h3 className="font-display text-2xl">Category Breakdown</h3>
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
                {categoryBreakdown.slice(0, 8).map((category) => (
                  <tr
                    key={category.category}
                    className="cursor-pointer border-t border-slate-100 hover:bg-[#fff8f4]"
                    onClick={() => setDrilldown((current) => ({ ...current, category: category.category }))}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{category.category}</td>
                    <td className="px-4 py-3">{category.rows}</td>
                    <td className="px-4 py-3">{category.runs}</td>
                    <td className="px-4 py-3">{category.avgScore.toFixed(2)}</td>
                    <td className="px-4 py-3">{category.failed}</td>
                  </tr>
                ))}
                {!categoryBreakdown.length ? (
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
          <p className="text-sm text-slate-500">{filteredRuns.length} run{filteredRuns.length === 1 ? "" : "s"} in view</p>
        </div>
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
              {filteredRuns.slice(0, 12).map((run) => (
                <tr key={run.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={`/runs/${run.id}`} className="text-ember">
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{run.model}</td>
                  <td className="px-4 py-3">{getProvider(run.model)}</td>
                  <td className="px-4 py-3 capitalize">{run.run_type}</td>
                  <td className="px-4 py-3 capitalize">{run.status}</td>
                  <td className="px-4 py-3">{run.avg_score.toFixed(2)}</td>
                  <td className="px-4 py-3">{new Date(run.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {!filteredRuns.length ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>No runs match the current drilldown.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
