from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DatasetRowCreate(BaseModel):
    input: dict[str, Any]
    expected_output: str | None = None
    model_output: str | None = None
    category: str | None = None


class DatasetCreate(BaseModel):
    name: str
    dataset_schema: dict[str, Any] = Field(alias="schema")
    rows: list[DatasetRowCreate]

    model_config = ConfigDict(populate_by_name=True)


class DatasetRowResponse(DatasetRowCreate):
    id: UUID

    model_config = {"from_attributes": True}


class DatasetResponse(BaseModel):
    id: UUID
    name: str
    schema: dict[str, Any]
    created_at: datetime
    rows: list[DatasetRowResponse]

    model_config = {"from_attributes": True}
