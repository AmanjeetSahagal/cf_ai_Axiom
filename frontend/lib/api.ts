import { AuthResponse, Comparison, Dataset, DatasetUploadRow, PromptTemplate, Run } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type RequestOptions = RequestInit & {
  token?: string | null;
};

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  googleLogin: (id_token: string) =>
    request<AuthResponse>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ id_token }),
    }),
  datasets: (token: string) => request<Dataset[]>("/datasets", { token }),
  createDataset: (
    token: string,
    payload: {
      name: string;
      schema: Record<string, unknown>;
      rows: DatasetUploadRow[];
    },
  ) =>
    request<Dataset>("/datasets", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  prompts: (token: string) => request<PromptTemplate[]>("/prompts", { token }),
  createPrompt: (
    token: string,
    payload: { name: string; system_prompt: string; user_template: string },
  ) =>
    request<PromptTemplate>("/prompts", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  runs: (token: string) => request<Run[]>("/runs", { token }),
  deleteRun: async (token: string, id: string) => {
    const response = await fetch(`${API_URL}/runs/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed: ${response.status}`);
    }
  },
  createRun: (
    token: string,
    payload: {
      dataset_id: string;
      prompt_template_id?: string | null;
      model: string;
      run_type?: "generated" | "imported";
      evaluators?: string[];
    },
  ) =>
    request<Run>("/runs", {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  run: (token: string, id: string) => request<Run>(`/runs/${id}`, { token }),
  exportRun: async (token: string, id: string, format: "json" | "csv", options?: { pretty?: boolean }) => {
    const query = new URLSearchParams({ format });
    if (format === "json") {
      query.set("pretty", String(options?.pretty ?? true));
    }
    const response = await fetch(`${API_URL}/runs/${id}/export?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed: ${response.status}`);
    }
    return response.blob();
  },
  compare: (token: string, baseline_run_id: string, candidate_run_id: string) =>
    request<Comparison>("/compare", {
      method: "POST",
      token,
      body: JSON.stringify({ baseline_run_id, candidate_run_id }),
    }),
  seedDemo: (token: string) =>
    request<{ dataset: Dataset; prompt: PromptTemplate; run: Run }>("/seed/demo", {
      method: "POST",
      token,
    }),
};
