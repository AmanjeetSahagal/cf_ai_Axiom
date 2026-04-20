import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import String, and_, cast, distinct, func, or_, select
from sqlalchemy.orm import Session, aliased, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Dataset, DatasetRow, EvalResult, EvalRun, EvaluatorScore, PromptTemplate, RunType, ScoreType, User
from app.schemas.run import (
    DashboardBreakdownItem,
    DashboardCategoryBreakdownItem,
    DashboardMatchingRun,
    DashboardModelBreakdownItem,
    DashboardProviderBreakdownItem,
    DashboardResponse,
    ResultListResponse,
    ResultResponse,
    RunCreate,
    RunDetailResponse,
    RunResponse,
)
from app.services.run_service import create_run
from app.tasks.worker import enqueue_run

router = APIRouter(prefix="/runs", tags=["runs"])


def get_owned_run_or_404(db: Session, current_user: User, run_id: str) -> EvalRun:
    run = db.execute(
        select(EvalRun)
        .join(Dataset, Dataset.id == EvalRun.dataset_id)
        .where(EvalRun.id == run_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


def disagreement_result_ids_query(run_id: str):
    return (
        select(EvaluatorScore.eval_result_id)
        .join(EvalResult, EvalResult.id == EvaluatorScore.eval_result_id)
        .where(EvalResult.run_id == run_id)
        .group_by(EvaluatorScore.eval_result_id)
        .having(func.count(distinct(EvaluatorScore.passed)) > 1)
    )


def hallucination_result_ids_query(run_id: str):
    return (
        select(EvaluatorScore.eval_result_id)
        .join(EvalResult, EvalResult.id == EvaluatorScore.eval_result_id)
        .where(
            EvalResult.run_id == run_id,
            EvaluatorScore.type == ScoreType.judge,
            EvaluatorScore.score_metadata["hallucination"].astext == "true",
        )
    )


def low_score_result_ids_query(run_id: str):
    return (
        select(EvaluatorScore.eval_result_id)
        .join(EvalResult, EvalResult.id == EvaluatorScore.eval_result_id)
        .where(
            EvalResult.run_id == run_id,
            EvaluatorScore.type == ScoreType.judge,
            EvaluatorScore.score < 3,
        )
    )


def filtered_results_query(
    run_id: str,
    result_filter: str = "all",
    category: str | None = None,
    search: str | None = None,
):
    query = (
        select(EvalResult)
        .join(DatasetRow, DatasetRow.id == EvalResult.dataset_row_id)
        .options(selectinload(EvalResult.scores), selectinload(EvalResult.dataset_row))
        .where(EvalResult.run_id == run_id)
    )

    if category and category != "all":
        query = query.where(DatasetRow.category == category)

    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                EvalResult.output.ilike(pattern),
                EvalResult.rendered_prompt.ilike(pattern),
                EvalResult.error_message.ilike(pattern),
                DatasetRow.expected_output.ilike(pattern),
                cast(DatasetRow.input, String).ilike(pattern),
            )
        )

    if result_filter == "failed":
        query = query.where(EvalResult.error_message.is_not(None))
    elif result_filter == "disagreement":
        query = query.where(EvalResult.id.in_(disagreement_result_ids_query(run_id)))
    elif result_filter == "hallucination":
        query = query.where(EvalResult.id.in_(hallucination_result_ids_query(run_id)))
    elif result_filter == "low_score":
        query = query.where(EvalResult.id.in_(low_score_result_ids_query(run_id)))

    return query


def get_provider_name(model: str) -> str:
    if model.startswith("gpt-"):
        return "OpenAI"
    if model.startswith("claude-"):
        return "Anthropic"
    if model.startswith("gemini-"):
        return "Google"
    if model.startswith("llama-"):
        return "Meta / OSS"
    if model.startswith("mistral") or model.startswith("mixtral-"):
        return "Mistral"
    return "Other"


def apply_provider_filter(query, provider: str | None):
    if not provider:
        return query
    if provider == "OpenAI":
        return query.where(EvalRun.model.ilike("gpt-%"))
    if provider == "Anthropic":
        return query.where(EvalRun.model.ilike("claude-%"))
    if provider == "Google":
        return query.where(EvalRun.model.ilike("gemini-%"))
    if provider == "Meta / OSS":
        return query.where(EvalRun.model.ilike("llama-%"))
    if provider == "Mistral":
        return query.where(or_(EvalRun.model.ilike("mistral%"), EvalRun.model.ilike("mixtral-%")))
    if provider == "Other":
        return query.where(
            ~or_(
                EvalRun.model.ilike("gpt-%"),
                EvalRun.model.ilike("claude-%"),
                EvalRun.model.ilike("gemini-%"),
                EvalRun.model.ilike("llama-%"),
                EvalRun.model.ilike("mistral%"),
                EvalRun.model.ilike("mixtral-%"),
            )
        )
    return query


def get_status_name(run: EvalRun) -> str:
    return run.status.value if hasattr(run.status, "value") else str(run.status)


@router.post("", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
def start_run(
    payload: RunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        run_type = RunType(payload.run_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    dataset = db.execute(
        select(Dataset).where(Dataset.id == payload.dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    prompt = None
    if payload.prompt_template_id:
        prompt = db.execute(
            select(PromptTemplate).where(
                PromptTemplate.id == payload.prompt_template_id,
                PromptTemplate.user_id == current_user.id,
            )
        ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if run_type == RunType.generated and not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    if run_type == RunType.imported and not any(row.model_output for row in dataset.rows):
        raise HTTPException(status_code=400, detail="Imported runs require at least one dataset row with model_output")
    try:
        run = create_run(db, payload.dataset_id, payload.prompt_template_id, payload.model, payload.evaluators, run_type=run_type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    enqueue_run(str(run.id))
    return run


@router.get("", response_model=list[RunResponse])
def list_runs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.execute(
            select(EvalRun)
            .join(Dataset, Dataset.id == EvalRun.dataset_id)
            .where(Dataset.user_id == current_user.id)
            .order_by(EvalRun.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    window_days: int | None = Query(default=None, ge=1),
    model: str | None = Query(default=None),
    provider: str | None = Query(default=None),
    run_type: str | None = Query(default=None, pattern="^(generated|imported)$"),
    category: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run_query = (
        select(EvalRun)
        .join(Dataset, Dataset.id == EvalRun.dataset_id)
        .where(Dataset.user_id == current_user.id)
    )
    if window_days:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=window_days)
        run_query = run_query.where(EvalRun.created_at >= cutoff)
    if model:
        run_query = run_query.where(EvalRun.model == model)
    if run_type:
        run_query = run_query.where(EvalRun.run_type == RunType(run_type))
    run_query = apply_provider_filter(run_query, provider)

    runs = db.execute(run_query.order_by(EvalRun.created_at.desc())).scalars().all()
    if not runs:
        return DashboardResponse(
            avg_score=0,
            total_cost=0,
            avg_latency=0,
            failure_rate=0,
            pass_breakdown=[
                DashboardBreakdownItem(name="Completed", value=0),
                DashboardBreakdownItem(name="In Flight", value=0),
                DashboardBreakdownItem(name="Failed", value=0),
            ],
            model_breakdown=[],
            provider_breakdown=[],
            run_type_breakdown=[],
            category_breakdown=[],
            matching_runs=[],
            total_runs=0,
        )

    run_ids = [run.id for run in runs]
    exact_score = aliased(EvaluatorScore)
    semantic_score = aliased(EvaluatorScore)
    judge_score = aliased(EvaluatorScore)
    result_rows = db.execute(
        select(
            EvalResult.run_id,
            DatasetRow.category,
            EvalResult.error_message,
            EvalResult.latency_ms,
            exact_score.score,
            semantic_score.score,
            judge_score.score,
        )
        .join(DatasetRow, DatasetRow.id == EvalResult.dataset_row_id)
        .outerjoin(
            exact_score,
            and_(exact_score.eval_result_id == EvalResult.id, exact_score.type == ScoreType.exact),
        )
        .outerjoin(
            semantic_score,
            and_(semantic_score.eval_result_id == EvalResult.id, semantic_score.type == ScoreType.semantic),
        )
        .outerjoin(
            judge_score,
            and_(judge_score.eval_result_id == EvalResult.id, judge_score.type == ScoreType.judge),
        )
        .where(EvalResult.run_id.in_(run_ids))
    ).all()

    if category:
        matching_category_run_ids = {
            row.run_id
            for row in result_rows
            if (row.category or "uncategorized") == category
        }
        runs = [run for run in runs if run.id in matching_category_run_ids]
        run_ids = [run.id for run in runs]
        result_rows = [row for row in result_rows if row.run_id in matching_category_run_ids]

    if not runs:
        return DashboardResponse(
            avg_score=0,
            total_cost=0,
            avg_latency=0,
            failure_rate=0,
            pass_breakdown=[
                DashboardBreakdownItem(name="Completed", value=0),
                DashboardBreakdownItem(name="In Flight", value=0),
                DashboardBreakdownItem(name="Failed", value=0),
            ],
            model_breakdown=[],
            provider_breakdown=[],
            run_type_breakdown=[],
            category_breakdown=[],
            matching_runs=[],
            total_runs=0,
        )

    latency_by_run = defaultdict(int)
    row_count_by_run = defaultdict(int)
    category_map: dict[str, dict[str, object]] = {}

    for row in result_rows:
        latency_by_run[row.run_id] += row.latency_ms
        row_count_by_run[row.run_id] += 1
        category_name = row.category or "uncategorized"
        exact_value = row[4]
        semantic_value = row[5]
        judge_value = row[6]
        score_candidates = [
            value
            for value in [exact_value, semantic_value, judge_value / 5 if isinstance(judge_value, (int, float)) else None]
            if isinstance(value, (int, float))
        ]
        avg_row_score = sum(score_candidates) / len(score_candidates) if score_candidates else 0
        category_entry = category_map.get(category_name, {"rows": 0, "runs": set(), "score_sum": 0.0, "failed": 0})
        category_entry["rows"] = int(category_entry["rows"]) + 1
        category_entry["score_sum"] = float(category_entry["score_sum"]) + avg_row_score
        if row.error_message:
            category_entry["failed"] = int(category_entry["failed"]) + 1
        cast_runs = category_entry["runs"]
        if isinstance(cast_runs, set):
            cast_runs.add(str(row.run_id))
        category_map[category_name] = category_entry

    avg_score = sum(run.avg_score for run in runs) / len(runs)
    total_cost = sum(run.total_cost for run in runs)
    avg_latency = (
        sum((latency_by_run[run.id] / row_count_by_run[run.id]) for run in runs if row_count_by_run[run.id])
        / len(runs)
        if runs
        else 0
    )
    failure_rate = (
        sum((run.failed_rows / run.total_rows) if run.total_rows else 0 for run in runs) / len(runs)
        if runs
        else 0
    )

    model_map = defaultdict(lambda: {"runs": 0, "score_sum": 0.0, "failure_sum": 0.0, "latency_sum": 0.0})
    provider_map = defaultdict(lambda: {"runs": 0, "score_sum": 0.0, "cost_sum": 0.0})
    run_type_map = defaultdict(int)
    matching_runs = []

    for run in runs:
        provider_name = get_provider_name(run.model)
        run_latency = latency_by_run[run.id] / row_count_by_run[run.id] if row_count_by_run[run.id] else 0
        model_entry = model_map[run.model]
        model_entry["runs"] += 1
        model_entry["score_sum"] += run.avg_score
        model_entry["failure_sum"] += (run.failed_rows / run.total_rows) if run.total_rows else 0
        model_entry["latency_sum"] += run_latency

        provider_entry = provider_map[provider_name]
        provider_entry["runs"] += 1
        provider_entry["score_sum"] += run.avg_score
        provider_entry["cost_sum"] += run.total_cost

        run_type_map[run.run_type.value if hasattr(run.run_type, "value") else str(run.run_type)] += 1
        matching_runs.append(
            DashboardMatchingRun(
                id=run.id,
                model=run.model,
                provider=provider_name,
                run_type=run.run_type.value if hasattr(run.run_type, "value") else str(run.run_type),
                status=get_status_name(run),
                avg_score=run.avg_score,
                avg_latency=run_latency,
                created_at=run.created_at,
            )
        )

    model_breakdown = sorted(
        [
            DashboardModelBreakdownItem(
                model=model_name,
                runs=int(values["runs"]),
                avg_score=float(values["score_sum"]) / int(values["runs"]),
                avg_failure_rate=float(values["failure_sum"]) / int(values["runs"]),
                avg_latency=float(values["latency_sum"]) / int(values["runs"]),
            )
            for model_name, values in model_map.items()
        ],
        key=lambda item: item.avg_score,
        reverse=True,
    )
    provider_breakdown = sorted(
        [
            DashboardProviderBreakdownItem(
                provider=provider_name,
                runs=int(values["runs"]),
                avg_score=float(values["score_sum"]) / int(values["runs"]),
                total_cost=float(values["cost_sum"]),
            )
            for provider_name, values in provider_map.items()
        ],
        key=lambda item: item.runs,
        reverse=True,
    )
    run_type_breakdown = [
        DashboardBreakdownItem(name=name, value=value)
        for name, value in run_type_map.items()
    ]
    category_breakdown = sorted(
        [
            DashboardCategoryBreakdownItem(
                category=category_name,
                rows=int(values["rows"]),
                runs=len(values["runs"]) if isinstance(values["runs"], set) else 0,
                avg_score=float(values["score_sum"]) / int(values["rows"]) if int(values["rows"]) else 0,
                failed=int(values["failed"]),
            )
            for category_name, values in category_map.items()
        ],
        key=lambda item: item.rows,
        reverse=True,
    )
    pass_breakdown = [
        DashboardBreakdownItem(name="Completed", value=sum(1 for run in runs if get_status_name(run) == "completed")),
        DashboardBreakdownItem(name="In Flight", value=sum(1 for run in runs if get_status_name(run) in {"pending", "running"})),
        DashboardBreakdownItem(name="Failed", value=sum(1 for run in runs if get_status_name(run) == "failed")),
    ]

    return DashboardResponse(
        avg_score=avg_score,
        total_cost=total_cost,
        avg_latency=avg_latency,
        failure_rate=failure_rate,
        pass_breakdown=pass_breakdown,
        model_breakdown=model_breakdown,
        provider_breakdown=provider_breakdown,
        run_type_breakdown=run_type_breakdown,
        category_breakdown=category_breakdown,
        matching_runs=matching_runs,
        total_runs=len(runs),
    )


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run(
    run_id: str,
    include_results: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = get_owned_run_or_404(db, current_user, run_id)
    disagreement_count = db.execute(
        select(func.count()).select_from(disagreement_result_ids_query(run_id).subquery())
    ).scalar_one()
    hallucination_count = db.execute(
        select(func.count()).select_from(hallucination_result_ids_query(run_id).subquery())
    ).scalar_one()
    results = []
    if include_results:
        results = db.execute(
            select(EvalResult)
            .options(selectinload(EvalResult.scores), selectinload(EvalResult.dataset_row))
            .where(EvalResult.run_id == run_id)
            .order_by(EvalResult.id)
        ).scalars().all()
    return RunDetailResponse(
        id=run.id,
        dataset_id=run.dataset_id,
        prompt_template_id=run.prompt_template_id,
        model=run.model,
        run_type=run.run_type.value if hasattr(run.run_type, "value") else str(run.run_type),
        selected_evaluators=run.selected_evaluators,
        status=run.status.value if hasattr(run.status, "value") else str(run.status),
        avg_score=run.avg_score,
        total_cost=run.total_cost,
        processed_rows=run.processed_rows,
        total_rows=run.total_rows,
        failed_rows=run.failed_rows,
        last_error=run.last_error,
        created_at=run.created_at,
        disagreement_count=disagreement_count,
        hallucination_count=hallucination_count,
        results=results,
    )


@router.get("/{run_id}/results", response_model=ResultListResponse)
def get_run_results(
    run_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    result_filter: str = Query(default="all", pattern="^(all|failed|disagreement|hallucination|low_score)$"),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = get_owned_run_or_404(db, current_user, run_id)
    base_query = filtered_results_query(run_id, result_filter=result_filter, category=category, search=search)
    total = db.execute(select(func.count()).select_from(base_query.order_by(None).subquery())).scalar_one()
    overall_total = db.execute(
        select(func.count()).select_from(select(EvalResult.id).where(EvalResult.run_id == run_id).subquery())
    ).scalar_one()
    total_pages = max(1, math.ceil(total / page_size)) if total else 1
    offset = (page - 1) * page_size
    items = db.execute(base_query.order_by(EvalResult.id).offset(offset).limit(page_size)).scalars().all()
    available_categories = db.execute(
        select(DatasetRow.category)
        .join(EvalResult, EvalResult.dataset_row_id == DatasetRow.id)
        .where(EvalResult.run_id == run_id, DatasetRow.category.is_not(None))
        .distinct()
        .order_by(DatasetRow.category)
    ).scalars().all()
    return ResultListResponse(
        run_id=run.id,
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        overall_total=overall_total,
        total_pages=total_pages,
        available_categories=available_categories,
    )


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.execute(
        select(EvalRun)
        .join(Dataset, Dataset.id == EvalRun.dataset_id)
        .where(EvalRun.id == run_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    db.delete(run)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{run_id}/export")
def export_run_results(
    run_id: str,
    format: str = Query(default="json", pattern="^(json|csv)$"),
    pretty: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = db.execute(
        select(EvalRun)
        .join(Dataset, Dataset.id == EvalRun.dataset_id)
        .options(
            selectinload(EvalRun.results).selectinload(EvalResult.scores),
            selectinload(EvalRun.results).selectinload(EvalResult.dataset_row),
        )
        .where(EvalRun.id == run_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    export_rows = []
    for result in run.results:
        score_map = {score.type.value if hasattr(score.type, "value") else str(score.type): score for score in result.scores}
        judge = score_map.get("judge")
        export_rows.append(
            {
                "result_id": str(result.id),
                "dataset_row_id": str(result.dataset_row_id),
                "category": result.dataset_row.category if result.dataset_row else None,
                "input": result.dataset_row.input if result.dataset_row else {},
                "expected_output": result.dataset_row.expected_output if result.dataset_row else None,
                "rendered_prompt": result.rendered_prompt,
                "output": result.output,
                "error_message": result.error_message,
                "latency_ms": result.latency_ms,
                "tokens": result.tokens,
                "exact_score": score_map.get("exact").score if score_map.get("exact") else None,
                "exact_passed": score_map.get("exact").passed if score_map.get("exact") else None,
                "semantic_score": score_map.get("semantic").score if score_map.get("semantic") else None,
                "semantic_passed": score_map.get("semantic").passed if score_map.get("semantic") else None,
                "judge_score": judge.score if judge else None,
                "judge_passed": judge.passed if judge else None,
                "judge_reason": judge.score_metadata.get("reason") if judge else None,
                "judge_hallucination": judge.score_metadata.get("hallucination") if judge else None,
                "scores": {
                    key: {
                        "score": value.score,
                        "passed": value.passed,
                        "metadata": value.score_metadata,
                    }
                    for key, value in score_map.items()
                },
            }
        )

    if format == "csv":
        output = StringIO()
        writer = csv.DictWriter(
            output,
            fieldnames=[
                "result_id",
                "dataset_row_id",
                "category",
                "input",
                "expected_output",
                "rendered_prompt",
                "output",
                "error_message",
                "latency_ms",
                "tokens",
                "exact_score",
                "exact_passed",
                "semantic_score",
                "semantic_passed",
                "judge_score",
                "judge_passed",
                "judge_reason",
                "judge_hallucination",
            ],
        )
        writer.writeheader()
        for row in export_rows:
            writer.writerow(
                {
                    **row,
                    "input": json.dumps(row["input"]),
                }
            )
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="run-{run_id}.csv"'},
        )

    return Response(
        content=json.dumps(
            {
                "run_id": str(run.id),
                "model": run.model,
                "selected_evaluators": run.selected_evaluators,
                "status": run.status.value if hasattr(run.status, "value") else str(run.status),
                "results": export_rows,
            },
            default=str,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        ),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="run-{run_id}.json"'},
    )
