from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RunCreate(BaseModel):
    dataset_id: UUID
    prompt_template_id: UUID | None = None
    model: str
    run_type: str = "generated"
    evaluators: list[str] = ["exact", "semantic", "judge"]


class ScoreResponse(BaseModel):
    type: str
    score: float
    passed: bool
    metadata: dict = Field(alias="score_metadata")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ResultResponse(BaseModel):
    id: UUID
    dataset_row_id: UUID
    input: dict[str, Any] | None = None
    expected_output: str | None = None
    category: str | None = None
    rendered_prompt: str
    output: str
    latency_ms: int
    tokens: int
    error_message: str | None = None
    scores: list[ScoreResponse]

    model_config = {"from_attributes": True}


class ResultListResponse(BaseModel):
    run_id: UUID
    items: list[ResultResponse]
    page: int
    page_size: int
    total: int
    overall_total: int
    total_pages: int
    available_categories: list[str]


class RunResponse(BaseModel):
    id: UUID
    dataset_id: UUID
    prompt_template_id: UUID | None
    model: str
    run_type: str
    selected_evaluators: list[str]
    status: str
    avg_score: float
    total_cost: float
    processed_rows: int
    total_rows: int
    failed_rows: int
    last_error: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunDetailResponse(RunResponse):
    disagreement_count: int = 0
    hallucination_count: int = 0
    results: list[ResultResponse] = []


class DashboardBreakdownItem(BaseModel):
    name: str
    value: int


class DashboardModelBreakdownItem(BaseModel):
    model: str
    runs: int
    avg_score: float
    avg_failure_rate: float
    avg_latency: float


class DashboardProviderBreakdownItem(BaseModel):
    provider: str
    runs: int
    avg_score: float
    total_cost: float


class DashboardCategoryBreakdownItem(BaseModel):
    category: str
    rows: int
    runs: int
    avg_score: float
    failed: int


class DashboardMatchingRun(BaseModel):
    id: UUID
    model: str
    provider: str
    run_type: str
    status: str
    avg_score: float
    avg_latency: float
    created_at: datetime


class DashboardResponse(BaseModel):
    avg_score: float
    total_cost: float
    avg_latency: float
    failure_rate: float
    pass_breakdown: list[DashboardBreakdownItem]
    model_breakdown: list[DashboardModelBreakdownItem]
    provider_breakdown: list[DashboardProviderBreakdownItem]
    run_type_breakdown: list[DashboardBreakdownItem]
    category_breakdown: list[DashboardCategoryBreakdownItem]
    matching_runs: list[DashboardMatchingRun]
    total_runs: int


class CompareRequest(BaseModel):
    baseline_run_id: UUID
    candidate_run_id: UUID


class CompareResponse(BaseModel):
    baseline_run_id: UUID
    candidate_run_id: UUID
    score_delta: float
    latency_delta: float
    cost_delta: float
    failed_rows_delta: int
    baseline_failed_rows: int
    candidate_failed_rows: int
    category_breakdown: dict[str, dict[str, float | int]]
