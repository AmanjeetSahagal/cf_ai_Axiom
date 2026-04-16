from collections import defaultdict
from statistics import mean
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import Dataset, DatasetRow, EvalResult, EvalRun, EvaluatorScore, PromptTemplate, RunStatus, RunType, ScoreType
from app.services.cost import estimate_cost
from app.services.evaluators import exact_match, llm_judge, semantic_similarity
from app.services.llm import call_model
from app.services.prompt_renderer import render_template


def normalize_evaluators(evaluators: list[str] | None) -> list[ScoreType]:
    selected = evaluators or [score_type.value for score_type in ScoreType]
    valid = {score_type.value: score_type for score_type in ScoreType}
    unknown = sorted(set(selected) - set(valid))
    if unknown:
        raise ValueError(f"Unsupported evaluators: {', '.join(unknown)}")
    normalized = [valid[evaluator] for evaluator in selected if evaluator in valid]
    if not normalized:
        raise ValueError("At least one evaluator must be selected")
    return normalized


def normalized_score_value(score_type: ScoreType, score: float) -> float:
    if score_type == ScoreType.judge:
        return score / 5.0
    return score


def create_run(
    db: Session,
    dataset_id: UUID,
    prompt_template_id: UUID | None,
    model: str,
    evaluators: list[str] | None = None,
    run_type: RunType = RunType.generated,
) -> EvalRun:
    dataset = db.get(Dataset, dataset_id)
    prompt = db.get(PromptTemplate, prompt_template_id) if prompt_template_id else None
    if not dataset or (run_type == RunType.generated and not prompt):
        raise ValueError("Dataset or prompt template not found")
    selected_evaluators = normalize_evaluators(evaluators)

    run = EvalRun(
        dataset_id=dataset.id,
        prompt_template_id=prompt.id if prompt else None,
        model=model,
        run_type=run_type,
        selected_evaluators=[score_type.value for score_type in selected_evaluators],
        status=RunStatus.pending,
        total_rows=len(dataset.rows),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def process_run(db: Session, run_id: UUID) -> EvalRun:
    run = db.execute(
        select(EvalRun)
        .options(
            joinedload(EvalRun.dataset).joinedload(Dataset.rows),
            joinedload(EvalRun.prompt_template),
        )
        .where(EvalRun.id == run_id)
    ).unique().scalar_one()
    run.status = RunStatus.running
    db.commit()

    score_totals: list[float] = []
    total_cost = 0.0
    selected_evaluators = normalize_evaluators(run.selected_evaluators)

    try:
        for row in run.dataset.rows:
            rendered_user = render_template(run.prompt_template.user_template, row.input) if run.prompt_template else ""
            try:
                if run.run_type == RunType.imported:
                    if not row.model_output:
                        raise ValueError("Imported run row is missing model_output")
                    output = row.model_output
                    latency_ms = 0
                    prompt_tokens = 0
                    output_tokens = 0
                    total_tokens = 0
                else:
                    output, latency_ms, prompt_tokens, output_tokens = call_model(
                        run.prompt_template.system_prompt,
                        rendered_user,
                        run.model,
                    )
                    total_tokens = prompt_tokens + output_tokens
                result = EvalResult(
                    run_id=run.id,
                    dataset_row_id=row.id,
                    rendered_prompt=rendered_user,
                    output=output,
                    latency_ms=latency_ms,
                    tokens=total_tokens,
                )
                db.add(result)
                db.flush()

                evaluations = {}
                if ScoreType.exact in selected_evaluators:
                    evaluations[ScoreType.exact] = exact_match(output, row.expected_output)
                if ScoreType.semantic in selected_evaluators:
                    evaluations[ScoreType.semantic] = semantic_similarity(output, row.expected_output)
                if ScoreType.judge in selected_evaluators:
                    evaluations[ScoreType.judge] = llm_judge(rendered_user, output, row.expected_output, run.model)
                for score_type, evaluation in evaluations.items():
                    db.add(
                        EvaluatorScore(
                            eval_result_id=result.id,
                            type=score_type,
                            score=evaluation.score,
                            passed=evaluation.passed,
                            score_metadata=evaluation.metadata,
                        )
                    )

                row_avg = mean([normalized_score_value(score_type, evaluation.score) for score_type, evaluation in evaluations.items()])
                score_totals.append(row_avg)
                if run.run_type == RunType.generated:
                    total_cost += estimate_cost(run.model, prompt_tokens, output_tokens)
            except Exception as exc:
                error_message = str(exc)
                result = EvalResult(
                    run_id=run.id,
                    dataset_row_id=row.id,
                    rendered_prompt=rendered_user,
                    output="",
                    latency_ms=0,
                    tokens=0,
                    error_message=error_message,
                )
                db.add(result)
                db.flush()
                for score_type in selected_evaluators:
                    db.add(
                        EvaluatorScore(
                            eval_result_id=result.id,
                            type=score_type,
                            score=0.0,
                            passed=False,
                            score_metadata={
                                "error": error_message,
                                "reason": "Row evaluation failed",
                            },
                        )
                    )
                run.failed_rows += 1

            run.processed_rows += 1
            db.commit()

        run.avg_score = round(mean(score_totals), 4) if score_totals else 0.0
        run.total_cost = round(total_cost, 6)
        run.status = RunStatus.completed
        db.commit()
        db.refresh(run)
        return run
    except Exception as exc:
        run.status = RunStatus.failed
        run.last_error = str(exc)
        db.commit()
        db.refresh(run)
        raise


def compare_runs(db: Session, baseline_run_id: UUID, candidate_run_id: UUID) -> dict:
    baseline = db.execute(
        select(EvalRun)
        .options(
            joinedload(EvalRun.results).joinedload(EvalResult.dataset_row),
            joinedload(EvalRun.results).joinedload(EvalResult.scores),
        )
        .where(EvalRun.id == baseline_run_id)
    ).unique().scalar_one()
    candidate = db.execute(
        select(EvalRun)
        .options(
            joinedload(EvalRun.results).joinedload(EvalResult.dataset_row),
            joinedload(EvalRun.results).joinedload(EvalResult.scores),
        )
        .where(EvalRun.id == candidate_run_id)
    ).unique().scalar_one()

    def avg_latency(run: EvalRun) -> float:
        return mean([result.latency_ms for result in run.results]) if run.results else 0.0

    def category_scores(run: EvalRun) -> dict[str, list[float]]:
        categories: dict[str, list[float]] = defaultdict(list)
        for result in run.results:
            normalized_scores = [normalized_score_value(score.type, score.score) for score in result.scores]
            if normalized_scores:
                categories[result.dataset_row.category or "uncategorized"].append(mean(normalized_scores))
        return categories

    def category_counts(run: EvalRun) -> dict[str, dict[str, int]]:
        categories: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "failed": 0})
        for result in run.results:
            category = result.dataset_row.category or "uncategorized"
            categories[category]["total"] += 1
            if result.error_message:
                categories[category]["failed"] += 1
        return categories

    baseline_categories = category_scores(baseline)
    candidate_categories = category_scores(candidate)
    baseline_counts = category_counts(baseline)
    candidate_counts = category_counts(candidate)
    category_breakdown = {}
    for category in sorted(set(baseline_categories) | set(candidate_categories) | set(baseline_counts) | set(candidate_counts)):
        baseline_avg = mean(baseline_categories.get(category, [0.0]))
        candidate_avg = mean(candidate_categories.get(category, [0.0]))
        category_breakdown[category] = {
            "baseline_score": round(baseline_avg, 4),
            "candidate_score": round(candidate_avg, 4),
            "delta": round(candidate_avg - baseline_avg, 4),
            "baseline_count": baseline_counts.get(category, {}).get("total", 0),
            "candidate_count": candidate_counts.get(category, {}).get("total", 0),
            "baseline_failed": baseline_counts.get(category, {}).get("failed", 0),
            "candidate_failed": candidate_counts.get(category, {}).get("failed", 0),
        }

    return {
        "baseline_run_id": baseline.id,
        "candidate_run_id": candidate.id,
        "score_delta": round(candidate.avg_score - baseline.avg_score, 4),
        "latency_delta": round(avg_latency(candidate) - avg_latency(baseline), 2),
        "cost_delta": round(candidate.total_cost - baseline.total_cost, 6),
        "failed_rows_delta": candidate.failed_rows - baseline.failed_rows,
        "baseline_failed_rows": baseline.failed_rows,
        "candidate_failed_rows": candidate.failed_rows,
        "category_breakdown": category_breakdown,
    }
