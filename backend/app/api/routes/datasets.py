from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models import Dataset, DatasetRow, User
from app.schemas.dataset import DatasetCreate, DatasetResponse

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
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
    return db.execute(
        select(Dataset).options(selectinload(Dataset.rows)).where(Dataset.id == dataset.id)
    ).scalar_one()


@router.get("", response_model=list[DatasetResponse])
def list_datasets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.execute(
            select(Dataset)
            .options(selectinload(Dataset.rows))
            .where(Dataset.user_id == current_user.id)
            .order_by(Dataset.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    dataset = db.execute(
        select(Dataset)
        .options(selectinload(Dataset.rows))
        .where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset
