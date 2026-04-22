import { AuthGuard } from "@/components/AuthGuard";
import { CopilotClient } from "@/components/CopilotClient";
import { Shell } from "@/components/Shell";

export default async function CopilotPage() {
  return (
    <Shell>
      <AuthGuard>
        <section className="space-y-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">AI Copilot</p>
            <h1 className="mt-2 font-display text-4xl text-ink">Cloudflare-backed evaluation assistant.</h1>
          </div>
          <CopilotClient />
        </section>
      </AuthGuard>
    </Shell>
  );
}
