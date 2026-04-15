export type DatasetRow = {
  id: string;
  input: Record<string, unknown>;
  expected_output?: string | null;
  category?: string | null;
};

export type Dataset = {
  id: string;
  name: string;
  schema: Record<string, unknown>;
  created_at: string;
  rows: DatasetRow[];
};

export type DatasetUploadRow = {
  input: Record<string, unknown>;
  expected_output?: string | null;
  category?: string | null;
};

export type PromptTemplate = {
  id: string;
  name: string;
  system_prompt: string;
  user_template: string;
  version: number;
  created_at: string;
};

export type Score = {
  type: string;
  score: number;
  passed: boolean;
  metadata: Record<string, unknown>;
};

export type RunResult = {
  id: string;
  dataset_row_id: string;
  rendered_prompt: string;
  output: string;
  latency_ms: number;
  tokens: number;
  error_message?: string | null;
  scores: Score[];
};

export type Run = {
  id: string;
  dataset_id: string;
  prompt_template_id: string;
  model: string;
  status: string;
  avg_score: number;
  total_cost: number;
  processed_rows: number;
  total_rows: number;
  failed_rows: number;
  last_error?: string | null;
  created_at: string;
  results?: RunResult[];
};

export type Comparison = {
  baseline_run_id: string;
  candidate_run_id: string;
  score_delta: number;
  latency_delta: number;
  cost_delta: number;
  category_breakdown: Record<string, { baseline: number; candidate: number; delta: number }>;
};

export type AuthUser = {
  id: string;
  email: string;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};
