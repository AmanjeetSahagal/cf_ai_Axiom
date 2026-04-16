"""add imported runs

Revision ID: 20260415_0002
Revises: 20260415_0001
Create Date: 2026-04-15 00:30:00.000000
"""

from alembic import op


revision = "20260415_0002"
down_revision = "20260415_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'runtype') THEN
                CREATE TYPE runtype AS ENUM ('generated', 'imported');
            END IF;
        END
        $$;
        """
    )
    op.execute("ALTER TABLE dataset_rows ADD COLUMN IF NOT EXISTS model_output TEXT")
    op.execute("ALTER TABLE eval_runs ADD COLUMN IF NOT EXISTS run_type runtype NOT NULL DEFAULT 'generated'")
    op.execute("ALTER TABLE eval_runs ALTER COLUMN prompt_template_id DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE eval_runs ALTER COLUMN prompt_template_id SET NOT NULL")
    op.execute("ALTER TABLE eval_runs DROP COLUMN IF EXISTS run_type")
    op.execute("ALTER TABLE dataset_rows DROP COLUMN IF EXISTS model_output")
    op.execute("DROP TYPE IF EXISTS runtype")
