import csv
import json
from io import StringIO

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Dataset, EvalResult, EvalRun, PromptTemplate, RunType, User
from app.schemas.run import ResultResponse, RunCreate, RunDetailResponse, RunResponse
from app.services.run_service import create_run
from app.tasks.worker import enqueue_run

router = APIRouter(prefix="/runs", tags=["runs"])


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


@router.get("/{run_id}", response_model=RunDetailResponse)
def get_run(
    run_id: str,
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
    return run


@router.get("/{run_id}/results", response_model=list[ResultResponse])
def get_run_results(
    run_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    run = get_run(run_id, db, current_user)
    return run.results


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
