import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="text-sm uppercase tracking-[0.3em] text-ember">Axiom</p>
      <h1 className="mt-4 max-w-4xl font-display text-6xl leading-tight text-ink">
        Turn LLM experimentation into a repeatable evaluation workflow.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-slate-600">
        Compare prompts, models, latency, and hallucination rates across structured datasets with async runs and row-level inspection.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <Link href="/dashboard" className="btn-primary px-6">
          Open Dashboard
        </Link>
        <Link href="/login" className="btn-secondary px-6">
          Login
        </Link>
      </div>
    </main>
  );
}
