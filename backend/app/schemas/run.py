from datetime import datetime
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
    rendered_prompt: str
    output: str
    latency_ms: int
    tokens: int
    error_message: str | None = None
    scores: list[ScoreResponse]

    model_config = {"from_attributes": True}


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
    results: list[ResultResponse]


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
