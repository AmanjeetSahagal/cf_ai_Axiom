import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";

const proofPoints = [
  { label: "Datasets", value: "Structured" },
  { label: "Runs", value: "Repeatable" },
  { label: "Scores", value: "Measured" },
];

const workflow = [
  {
    step: "01",
    title: "Upload a dataset",
    body: "Bring questions, context, expected answers, and optional imported outputs.",
  },
  {
    step: "02",
    title: "Launch a run",
    body: "Evaluate a provider-backed model or score imported model traces.",
  },
  {
    step: "03",
    title: "Inspect the results",
    body: "Compare quality, latency, cost, and row-level failures in one place.",
  },
];

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-8rem] h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-ember/18 blur-3xl" />
        <div className="absolute left-[18%] top-[18rem] h-[20rem] w-[20rem] rounded-full bg-[#0f4c3a]/10 blur-3xl" />
        <div className="absolute right-[14%] top-[26rem] h-[18rem] w-[18rem] rounded-full bg-[#d4a72c]/10 blur-3xl" />
        <div className="absolute inset-x-0 top-[28rem] h-[28rem] bg-gradient-to-b from-transparent via-white/25 to-transparent" />
      </div>

      <div className="relative px-4 pt-8 sm:px-6 lg:px-8">
        <SiteHeader />
      </div>

      <section className="relative px-6 pb-16 pt-6 lg:px-10 lg:pb-24">
        <div className="liquid-glass mx-auto w-full max-w-5xl rounded-[34px] px-6 py-12 lg:px-10 lg:py-16">
          <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
            <h1 className="max-w-5xl font-display text-5xl leading-[0.98] text-ink md:text-7xl">
              Evaluate LLM systems with a cleaner engineering loop.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Run structured datasets, inspect failures, and compare prompts, models, and imported outputs without falling back to manual QA.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link href="/dashboard" className="btn-primary px-7 py-3.5">
                Open Dashboard
              </Link>
              <Link href="/login" className="btn-secondary px-7 py-3.5">
                Continue with Google
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 py-10 lg:px-10">
        <div className="mx-auto max-w-4xl rounded-[30px] bg-[linear-gradient(135deg,rgba(199,81,45,0.10),rgba(255,255,255,0.55),rgba(212,167,44,0.12))] px-8 py-8">
          <div className="grid gap-6 sm:grid-cols-3">
          {proofPoints.map((item) => (
            <div key={item.label} className="text-center">
              <p className="font-display text-3xl text-ink">{item.value}</p>
              <p className="mt-2 text-sm uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
            </div>
          ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Workflow</p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-ink md:text-5xl">
            A straightforward path from dataset to decision.
          </h2>
        </div>
        <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-6">
          {workflow.map((item) => (
            <div
              key={item.step}
              className={`mx-auto w-full max-w-2xl rounded-[28px] px-8 py-8 text-center ${
                item.step === "01"
                  ? "liquid-glass bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(255,244,238,0.34))]"
                  : item.step === "02"
                    ? "liquid-glass bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(229,244,239,0.30))]"
                    : "liquid-glass bg-[linear-gradient(180deg,rgba(255,255,255,0.54),rgba(250,244,217,0.30))]"
              }`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ember text-sm font-semibold text-white shadow-sm">
                {item.step}
              </div>
              <h3 className="mt-5 font-display text-3xl text-ink">{item.title}</h3>
              <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 pb-20 pt-6 lg:px-10 lg:pb-24">
        <div className="liquid-glass mx-auto max-w-3xl rounded-[34px] bg-[linear-gradient(135deg,rgba(255,248,244,0.70),rgba(255,255,255,0.38),rgba(244,216,207,0.42))] px-8 py-12 text-center">
          <p className="text-sm uppercase tracking-[0.28em] text-slate-500">Start</p>
          <h2 className="mt-4 font-display text-4xl leading-tight text-ink md:text-5xl">
            Use Axiom to measure what changed before you ship it.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/runs" className="btn-primary">
              Launch a Run
            </Link>
            <Link href="/datasets" className="btn-secondary">
              Upload a Dataset
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
