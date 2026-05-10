# finance_agent/models.py
from typing import Any

from pydantic import BaseModel, Field


class SubQuestion(BaseModel):
    id: int = Field(description="The unique ID of the subquestion.")
    question: str = Field(description="The subquestion itself.")
    depends_on: list[int] | None = Field(
        description="The list of subquestion ids whose answer is required to answer this subquestion.",
        default=None,
    )


class AnsweredSubQuestion(BaseModel):
    subquestion: SubQuestion = Field(
        description="The subquestion that has been answered."
    )
    answer: str = Field(description="The answer to the subquestion.")
    extracted_data: dict[str, Any] | None = None  # store structured extracted data if available


class ToolDescription(BaseModel):
    name: str
    description: str
    parameters_schema: dict | None = None
    callable: Any | None = None
