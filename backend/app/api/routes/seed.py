from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models import Dataset, DatasetRow, PromptTemplate, RunType, User
from app.schemas.dataset import DatasetDetailResponse
from app.schemas.prompt import PromptTemplateResponse
from app.schemas.run import RunResponse
from app.services.run_service import create_run
from app.tasks.worker import enqueue_run

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("/demo")
def seed_demo(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dataset = db.execute(
        select(Dataset).where(Dataset.user_id == current_user.id, Dataset.name == "Support QA Demo")
    ).scalar_one_or_none()
    if not dataset:
        dataset = Dataset(
            user_id=current_user.id,
            name="Support QA Demo",
            schema={"question": "string", "context": "string"},
        )
        db.add(dataset)
        db.flush()
        rows = [
            DatasetRow(
                dataset_id=dataset.id,
                input={
                    "question": "What is the refund window?",
                    "context": "Customers can request refunds within 30 days of purchase.",
                },
                expected_output="Customers can request refunds within 30 days of purchase.",
                category="policy",
            ),
            DatasetRow(
                dataset_id=dataset.id,
                input={
                    "question": "Does the API support webhooks?",
                    "context": "The API supports webhooks for invoice.created and run.completed events.",
                },
                expected_output="The API supports webhooks for invoice.created and run.completed events.",
                category="product",
            ),
            DatasetRow(
                dataset_id=dataset.id,
                input={
                    "question": "How do I rotate an API key?",
                    "context": "Rotate API keys from the developer settings page, then redeploy your app with the new secret.",
                },
                expected_output="Rotate API keys from the developer settings page, then redeploy your app with the new secret.",
                category="operations",
            ),
        ]
        db.add_all(rows)

    prompt = db.execute(
        select(PromptTemplate).where(
            PromptTemplate.user_id == current_user.id,
            PromptTemplate.name == "Support Answering",
        )
    ).scalars().first()
    if not prompt:
        prompt = PromptTemplate(
            user_id=current_user.id,
            name="Support Answering",
            system_prompt="Answer using only the provided context. Be concise and avoid unsupported claims.",
            user_template="Question: {{question}}\n\nContext: {{context}}\n\nAnswer:",
            version=1,
        )
        db.add(prompt)

    db.commit()
    db.refresh(dataset)
    db.refresh(prompt)
    dataset_rows = db.execute(
        select(DatasetRow).where(DatasetRow.dataset_id == dataset.id).order_by(DatasetRow.id)
    ).scalars().all()

    run = create_run(db, dataset.id, prompt.id, settings.gemini_model, ["exact", "semantic", "judge"], run_type=RunType.generated)
    enqueue_run(str(run.id))
    return {
        "dataset": DatasetDetailResponse(
            id=dataset.id,
            name=dataset.name,
            schema=dataset.schema,
            created_at=dataset.created_at,
            row_count=len(dataset_rows),
            imported_output_count=sum(1 for row in dataset_rows if row.model_output),
            rows=dataset_rows,
            page=1,
            page_size=max(len(dataset_rows), 1),
            total_pages=1,
        ),
        "prompt": PromptTemplateResponse.model_validate(prompt),
        "run": RunResponse.model_validate(run),
    }
