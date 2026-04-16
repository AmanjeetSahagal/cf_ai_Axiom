"use client";

import { FormEvent, useEffect, useState } from "react";

import { PromptEditor } from "@/components/PromptEditor";
import { api } from "@/lib/api";
import { PromptTemplate } from "@/lib/types";

function extractVariables(template: string) {
  return Array.from(new Set(Array.from(template.matchAll(/\{\{(\w+)\}\}/g)).map((match) => match[1]))).sort();
}

export function PromptManager() {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [name, setName] = useState("Baseline QA Prompt");
  const [systemPrompt, setSystemPrompt] = useState("Answer only with information grounded in the provided context.");
  const [userTemplate, setUserTemplate] = useState("Question: {{question}}\n\nContext: {{context}}\n\nAnswer:");
  const [status, setStatus] = useState("Loading prompts...");
  const variables = extractVariables(userTemplate);

  async function loadPrompts() {
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      const data = await api.prompts(token);
      setPrompts(data);
      setStatus(data.length ? "" : "No prompts yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load prompts");
    }
  }

  useEffect(() => {
    void loadPrompts();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const token = window.localStorage.getItem("axiom-token");
    if (!token) {
      setStatus("Login required.");
      return;
    }
    try {
      setStatus("Saving prompt...");
      await api.createPrompt(token, {
        name,
        system_prompt: systemPrompt,
        user_template: userTemplate,
      });
      setStatus("Prompt saved.");
      await loadPrompts();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to save prompt");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-panel">
        <h3 className="font-display text-3xl">Create Prompt Template</h3>
        <input className="rounded-2xl border border-slate-200 px-4 py-3" value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="min-h-28 rounded-2xl border border-slate-200 px-4 py-3" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
        <textarea className="min-h-40 rounded-2xl border border-slate-200 px-4 py-3 font-mono text-sm" value={userTemplate} onChange={(e) => setUserTemplate(e.target.value)} />
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Template Variables</p>
          <p className="mt-2 text-sm text-slate-600">
            {variables.length ? variables.map((variable) => `{{${variable}}}`).join(", ") : "No template variables detected yet."}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            These placeholders must exist in your dataset schema for runs to render prompts correctly.
          </p>
        </div>
        <button className="btn-primary w-fit" type="submit">Save Prompt</button>
        <p className="text-sm text-slate-500">{status}</p>
      </form>
      {prompts[0] ? <PromptEditor systemPrompt={prompts[0].system_prompt} userTemplate={prompts[0].user_template} /> : null}
    </div>
  );
}
