import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


def default_uuid():
    return uuid.uuid4()


class RunStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class RunType(str, enum.Enum):
    generated = "generated"
    imported = "imported"


class ScoreType(str, enum.Enum):
    exact = "exact"
    semantic = "semantic"
    judge = "judge"


def default_evaluators() -> list[str]:
    return [score_type.value for score_type in ScoreType]


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    datasets = relationship("Dataset", back_populates="user", cascade="all, delete-orphan")
    prompts = relationship("PromptTemplate", back_populates="user", cascade="all, delete-orphan")
    provider_keys = relationship("UserProviderKey", back_populates="user", cascade="all, delete-orphan")


class ProviderType(str, enum.Enum):
    openai = "openai"
    anthropic = "anthropic"
    gemini = "gemini"


class UserProviderKey(Base):
    __tablename__ = "user_provider_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    provider: Mapped[ProviderType] = mapped_column(Enum(ProviderType), index=True)
    encrypted_api_key: Mapped[str] = mapped_column(Text)
    key_hint: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="provider_keys")


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    schema: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="datasets")
    rows = relationship("DatasetRow", back_populates="dataset", cascade="all, delete-orphan")
    runs = relationship("EvalRun", back_populates="dataset")


class DatasetRow(Base):
    __tablename__ = "dataset_rows"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("datasets.id"), index=True)
    input: Mapped[dict] = mapped_column(JSON, default=dict)
    expected_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_output: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(120), nullable=True)

    dataset = relationship("Dataset", back_populates="rows")
    results = relationship("EvalResult", back_populates="dataset_row")


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    system_prompt: Mapped[str] = mapped_column(Text)
    user_template: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="prompts")
    runs = relationship("EvalRun", back_populates="prompt_template")


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    dataset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("datasets.id"), index=True)
    prompt_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("prompt_templates.id"), index=True, nullable=True
    )
    model: Mapped[str] = mapped_column(String(120))
    run_type: Mapped[RunType] = mapped_column(Enum(RunType), default=RunType.generated)
    selected_evaluators: Mapped[list[str]] = mapped_column(JSON, default=default_evaluators)
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.pending)
    avg_score: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    processed_rows: Mapped[int] = mapped_column(Integer, default=0)
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    failed_rows: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="runs")
    prompt_template = relationship("PromptTemplate", back_populates="runs")
    results = relationship("EvalResult", back_populates="run", cascade="all, delete-orphan")


class EvalResult(Base):
    __tablename__ = "eval_results"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("eval_runs.id"), index=True)
    dataset_row_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dataset_rows.id"), index=True
    )
    rendered_prompt: Mapped[str] = mapped_column(Text)
    output: Mapped[str] = mapped_column(Text)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    run = relationship("EvalRun", back_populates="results")
    dataset_row = relationship("DatasetRow", back_populates="results")
    scores = relationship("EvaluatorScore", back_populates="eval_result", cascade="all, delete-orphan")

    @property
    def input(self) -> dict:
        return self.dataset_row.input if self.dataset_row else {}

    @property
    def expected_output(self) -> str | None:
        return self.dataset_row.expected_output if self.dataset_row else None

    @property
    def category(self) -> str | None:
        return self.dataset_row.category if self.dataset_row else None


class EvaluatorScore(Base):
    __tablename__ = "evaluator_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=default_uuid)
    eval_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("eval_results.id"), index=True
    )
    type: Mapped[ScoreType] = mapped_column(Enum(ScoreType))
    score: Mapped[float] = mapped_column(Float)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    score_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    eval_result = relationship("EvalResult", back_populates="scores")
