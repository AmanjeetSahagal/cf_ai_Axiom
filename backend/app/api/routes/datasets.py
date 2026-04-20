import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Dataset, DatasetRow, User
from app.schemas.dataset import DatasetCreate, DatasetDetailResponse, DatasetSummaryResponse

router = APIRouter(prefix="/datasets", tags=["datasets"])


def get_owned_dataset_or_404(db: Session, current_user: User, dataset_id: str) -> Dataset:
    dataset = db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


def dataset_counts(db: Session, dataset_id: str) -> tuple[int, int]:
    row_count = db.execute(
        select(func.count()).select_from(DatasetRow).where(DatasetRow.dataset_id == dataset_id)
    ).scalar_one()
    imported_output_count = db.execute(
        select(func.count()).select_from(DatasetRow).where(
            DatasetRow.dataset_id == dataset_id,
            DatasetRow.model_output.is_not(None),
        )
    ).scalar_one()
    return row_count, imported_output_count


@router.post("", response_model=DatasetDetailResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(
    payload: DatasetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dataset = Dataset(user_id=current_user.id, name=payload.name, schema=payload.dataset_schema)
    db.add(dataset)
    db.flush()
    for row in payload.rows:
        db.add(
            DatasetRow(
                dataset_id=dataset.id,
                input=row.input,
                expected_output=row.expected_output,
                model_output=row.model_output,
                category=row.category,
            )
        )
    db.commit()
    db.refresh(dataset)
    rows = db.execute(
        select(DatasetRow).where(DatasetRow.dataset_id == dataset.id).order_by(DatasetRow.id)
    ).scalars().all()
    row_count, imported_output_count = dataset_counts(db, str(dataset.id))
    return DatasetDetailResponse(
        id=dataset.id,
        name=dataset.name,
        schema=dataset.schema,
        created_at=dataset.created_at,
        row_count=row_count,
        imported_output_count=imported_output_count,
        rows=rows,
        page=1,
        page_size=max(len(rows), 1),
        total_pages=1,
    )


@router.get("", response_model=list[DatasetSummaryResponse])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    datasets = (
        db.execute(
            select(Dataset)
            .where(Dataset.user_id == current_user.id)
            .order_by(Dataset.created_at.desc())
        )
        .scalars()
        .all()
    )
    counts_by_dataset = {
        dataset_id: (row_count, imported_output_count)
        for dataset_id, row_count, imported_output_count in db.execute(
            select(
                DatasetRow.dataset_id,
                func.count(DatasetRow.id),
                func.count(DatasetRow.model_output),
            )
            .join(Dataset, Dataset.id == DatasetRow.dataset_id)
            .where(Dataset.user_id == current_user.id)
            .group_by(DatasetRow.dataset_id)
        ).all()
    }
    return [
        DatasetSummaryResponse(
            id=dataset.id,
            name=dataset.name,
            schema=dataset.schema,
            created_at=dataset.created_at,
            row_count=counts_by_dataset.get(dataset.id, (0, 0))[0],
            imported_output_count=counts_by_dataset.get(dataset.id, (0, 0))[1],
        )
        for dataset in datasets
    ]


@router.get("/{dataset_id}", response_model=DatasetDetailResponse)
def get_dataset(
    dataset_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dataset = get_owned_dataset_or_404(db, current_user, dataset_id)
    row_count, imported_output_count = dataset_counts(db, dataset_id)
    total_pages = max(1, math.ceil(row_count / page_size)) if row_count else 1
    rows = db.execute(
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset_id)
        .order_by(DatasetRow.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).scalars().all()
    return DatasetDetailResponse(
        id=dataset.id,
        name=dataset.name,
        schema=dataset.schema,
        created_at=dataset.created_at,
        row_count=row_count,
        imported_output_count=imported_output_count,
        rows=rows,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )
