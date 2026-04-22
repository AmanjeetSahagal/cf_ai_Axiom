import {
  AuthResponse,
  Comparison,
  DashboardData,
  Dataset,
  DatasetUploadRow,
  PromptTemplate,
  ProviderKeyStatus,
  Run,
  RunResultPage,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/backend";

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
  providerKeys: (token: string) => request<ProviderKeyStatus[]>("/provider-keys", { token }),
  saveProviderKey: (
    token: string,
    payload: { provider: "openai" | "anthropic" | "gemini"; api_key: string },
  ) =>
    request<{ provider: string; key_hint: string }>("/provider-keys", {
      method: "PUT",
      token,
      body: JSON.stringify(payload),
    }),
  deleteProviderKey: async (token: string, provider: "openai" | "anthropic" | "gemini") => {
    const response = await fetch(`${API_URL}/provider-keys/${provider}`, {
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
  datasets: (token: string) => request<Dataset[]>("/datasets", { token }),
  dataset: (
    token: string,
    id: string,
    options?: { page?: number; page_size?: number },
  ) => {
    const query = new URLSearchParams();
    if (options?.page) query.set("page", String(options.page));
    if (options?.page_size) query.set("page_size", String(options.page_size));
    return request<Dataset>(`/datasets/${id}${query.toString() ? `?${query.toString()}` : ""}`, { token });
  },
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
  dashboard: (
    token: string,
    options?: {
      window_days?: number;
      model?: string;
      provider?: string;
      run_type?: "generated" | "imported";
      category?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (options?.window_days) query.set("window_days", String(options.window_days));
    if (options?.model) query.set("model", options.model);
    if (options?.provider) query.set("provider", options.provider);
    if (options?.run_type) query.set("run_type", options.run_type);
    if (options?.category) query.set("category", options.category);
    return request<DashboardData>(`/runs/dashboard${query.toString() ? `?${query.toString()}` : ""}`, { token });
  },
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
  run: (
    token: string,
    id: string,
    options?: { include_results?: boolean },
  ) => {
    const query = new URLSearchParams();
    if (options?.include_results) query.set("include_results", "true");
    return request<Run>(`/runs/${id}${query.toString() ? `?${query.toString()}` : ""}`, { token });
  },
  runResults: (
    token: string,
    id: string,
    options?: {
      page?: number;
      page_size?: number;
      result_filter?: "all" | "failed" | "disagreement" | "hallucination" | "low_score";
      category?: string;
      search?: string;
    },
  ) => {
    const query = new URLSearchParams();
    if (options?.page) query.set("page", String(options.page));
    if (options?.page_size) query.set("page_size", String(options.page_size));
    if (options?.result_filter && options.result_filter !== "all") query.set("result_filter", options.result_filter);
    if (options?.category && options.category !== "all") query.set("category", options.category);
    if (options?.search?.trim()) query.set("search", options.search.trim());
    return request<RunResultPage>(`/runs/${id}/results${query.toString() ? `?${query.toString()}` : ""}`, { token });
  },
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
