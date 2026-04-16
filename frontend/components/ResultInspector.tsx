"use client";

import { useMemo, useState } from "react";

import { RunResult, Score } from "@/lib/types";
import { getImportedModelName, getImportedProvider } from "@/lib/dataset-upload";

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

function getJudgeReason(score?: Score) {
  if (!score) {
    return null;
  }
  const reason = score.metadata?.reason;
  return typeof reason === "string" ? reason : null;
}

function formatMetadata(score: Score) {
  const hiddenKeys = new Set(["reason", "hallucination"]);
  const filtered = Object.fromEntries(Object.entries(score.metadata || {}).filter(([key]) => !hiddenKeys.has(key)));
  return Object.keys(filtered).length ? JSON.stringify(filtered) : "";
}

function searchableText(result: RunResult) {
  return [
    result.category,
    result.output,
    result.expected_output,
    result.rendered_prompt,
    result.error_message,
    ...Object.entries(result.input || {}).flatMap(([key, value]) => [key, String(value)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function ResultInspector({
  results,
  model,
  runType,
}: {
  results: RunResult[];
  model: string;
  runType: "generated" | "imported";
}) {
  const [filter, setFilter] = useState<"all" | "failed" | "disagreement" | "hallucination" | "low_score">("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const categories = useMemo(() => {
    const values = new Set(
      results
        .map((result) => result.category)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );
    return ["all", ...Array.from(values).sort()];
  }, [results]);

  const filteredResults = useMemo(() => {
    const byMode = (() => {
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
    })();

    return byMode.filter((result) => {
      if (category !== "all" && result.category !== category) {
        return false;
      }
      if (search && !searchableText(result).includes(search.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [category, filter, results, search]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredResults.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedResults = filteredResults.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const importedProviders = new Set(results.map((result) => getImportedProvider(result)).filter(Boolean));
  const importedModels = new Set(results.map((result) => getImportedModelName(result)).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Inspection</p>
            <h3 className="mt-2 font-display text-3xl text-ink">Row-level evaluation results</h3>
            <p className="mt-2 text-sm text-slate-600">
              {runType === "imported"
                ? `Evaluating imported outputs from ${importedProviders.size || importedModels.size ? "external model traces" : "uploaded rows"}.`
                : `Generated run from ${model}. Search, filter, and page through the result set.`}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {filteredResults.length} matching row{filteredResults.length === 1 ? "" : "s"}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Page {currentPage} of {pageCount}
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr,0.9fr,1fr]">
          <input
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="Search output, prompt, expected answer, or input fields"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {value === "all" ? "All categories" : value}
              </option>
            ))}
          </select>
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
                onClick={() => {
                  setFilter(value as typeof filter);
                  setPage(1);
                }}
                className={`${filter === value ? "btn-chip-active" : "btn-chip"} text-sm`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {runType === "imported" ? (
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">Providers: {importedProviders.size || 0}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Models: {importedModels.size || 0}</span>
          </div>
        ) : null}
      </div>
      {paginatedResults.map((result) => {
        const exact = getScore(result, "exact");
        const semantic = getScore(result, "semantic");
        const judge = getScore(result, "judge");
        const disagreement = hasDisagreement(result);
        const hallucination = isHallucination(result);
        const judgeReason = getJudgeReason(judge);
        const importedProvider = getImportedProvider(result);
        const importedModelName = getImportedModelName(result);

        return (
          <article key={result.id} className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <span>Latency: {result.latency_ms} ms</span>
              <span>Tokens: {result.tokens}</span>
              {result.category ? <span>Category: {result.category}</span> : null}
              {importedProvider ? <span>Provider: {importedProvider}</span> : null}
              {importedModelName ? <span>Model: {importedModelName}</span> : null}
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
                      {"displayScore" in (score || {})
                        ? (score as Score & { displayScore: number }).displayScore.toFixed(2)
                        : (score?.score ?? 0).toFixed(2)}
                    </p>
                    <span className={`mb-1 rounded-full px-2 py-1 text-xs ${score?.passed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {score?.passed ? "pass" : "fail"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr,1fr]">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-ink">Input</h4>
                  <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">
                    {JSON.stringify(result.input || {}, null, 2)}
                  </pre>
                </div>
                {result.expected_output ? (
                  <div>
                    <h4 className="font-semibold text-ink">Expected Output</h4>
                    <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">{result.expected_output}</pre>
                  </div>
                ) : null}
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-ink">Rendered Prompt</h4>
                  <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">{result.rendered_prompt}</pre>
                </div>
                <div>
                  <h4 className="font-semibold text-ink">{result.error_message ? "Error" : "Model Output"}</h4>
                  <pre className="mt-2 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm">{result.error_message || result.output}</pre>
                </div>
              </div>
            </div>
            {judge ? (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Judge Reasoning</p>
                  <span className={`rounded-full px-2 py-1 text-xs ${judge.passed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {judge.passed ? "pass" : "fail"}
                  </span>
                  {typeof judge.metadata?.hallucination === "boolean" ? (
                    <span className={`rounded-full px-2 py-1 text-xs ${judge.metadata.hallucination ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {judge.metadata.hallucination ? "hallucination flagged" : "grounded"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-slate-700">{judgeReason || "No judge reason provided."}</p>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {result.scores.map((score) => (
                <div key={score.type} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{score.type}</p>
                  <p className="mt-2 font-display text-3xl">{score.score.toFixed(2)}</p>
                  {formatMetadata(score) ? <p className="mt-2 break-words text-sm text-slate-600">{formatMetadata(score)}</p> : null}
                </div>
              ))}
            </div>
          </article>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <p className="text-sm text-slate-500">
          Showing {(currentPage - 1) * pageSize + (paginatedResults.length ? 1 : 0)}-
          {(currentPage - 1) * pageSize + paginatedResults.length} of {filteredResults.length}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-secondary text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Next
          </button>
        </div>
      </div>
      {!filteredResults.length ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-8 text-slate-500 shadow-panel">
          No rows match the current filter.
        </div>
      ) : null}
    </div>
  );
}
