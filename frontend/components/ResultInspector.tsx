"use client";

import { useMemo, useState } from "react";

import { RunResult, Score } from "@/lib/types";

function getScore(result: RunResult, type: string): Score | undefined {
  return result.scores.find((score) => score.type === type);
}

function hasDisagreement(result: RunResult) {
  const scoreValues = result.scores.map((score) => score.passed);
  return new Set(scoreValues).size > 1;
}

function isHallucination(result: RunResult) {
  const judge = getScore(result, "judge");
  return Boolean(judge?.metadata && typeof judge.metadata.hallucination === "boolean" && judge.metadata.hallucination);
}

export function ResultInspector({ results }: { results: RunResult[] }) {
  const [filter, setFilter] = useState<"all" | "failed" | "disagreement" | "hallucination" | "low_score">("all");

  const filteredResults = useMemo(() => {
    switch (filter) {
      case "failed":
        return results.filter((result) => Boolean(result.error_message));
      case "disagreement":
        return results.filter((result) => hasDisagreement(result));
      case "hallucination":
        return results.filter((result) => isHallucination(result));
      case "low_score":
        return results.filter((result) => {
          const judge = getScore(result, "judge");
          return typeof judge?.score === "number" && judge.score < 3;
        });
      default:
        return results;
    }
  }, [filter, results]);

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All Rows"],
            ["failed", "Failed"],
            ["disagreement", "Disagreements"],
            ["hallucination", "Hallucinations"],
            ["low_score", "Low Judge Score"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value as typeof filter)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${filter === value ? "bg-ink text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          Showing {filteredResults.length} of {results.length} result{results.length === 1 ? "" : "s"}.
        </p>
      </div>
      {filteredResults.map((result) => {
        const exact = getScore(result, "exact");
        const semantic = getScore(result, "semantic");
        const judge = getScore(result, "judge");
        const disagreement = hasDisagreement(result);
        const hallucination = isHallucination(result);

        return (
        <article key={result.id} className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>Latency: {result.latency_ms} ms</span>
            <span>Tokens: {result.tokens}</span>
            {result.error_message ? <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Row failed</span> : null}
            {disagreement ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Evaluator disagreement</span> : null}
            {hallucination ? <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Judge flagged hallucination</span> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { label: "Exact", score: exact },
              { label: "Semantic", score: semantic },
              { label: "Judge", score: judge ? { ...judge, displayScore: judge.score / 5 } : undefined },
            ].map(({ label, score }) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="font-display text-3xl">
                    {"displayScore" in (score || {}) ? (score as Score & { displayScore: number }).displayScore.toFixed(2) : (score?.score ?? 0).toFixed(2)}
                  </p>
                  <span className={`mb-1 rounded-full px-2 py-1 text-xs ${score?.passed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {score?.passed ? "pass" : "fail"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <h4 className="font-semibold text-ink">Rendered Prompt</h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">{result.rendered_prompt}</pre>
            </div>
            <div>
              <h4 className="font-semibold text-ink">{result.error_message ? "Error" : "Model Output"}</h4>
              <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">{result.error_message || result.output}</pre>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {result.scores.map((score) => (
              <div key={score.type} className="rounded-2xl border border-slate-100 bg-white p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{score.type}</p>
                <p className="mt-2 font-display text-3xl">{score.score.toFixed(2)}</p>
                <p className="mt-2 text-sm text-slate-600 break-words">{JSON.stringify(score.metadata)}</p>
              </div>
            ))}
          </div>
        </article>
        );
      })}
      {!filteredResults.length ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-8 text-slate-500 shadow-panel">
          No rows match the current filter.
        </div>
      ) : null}
    </div>
  );
}
