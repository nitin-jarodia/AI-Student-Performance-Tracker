# routes/chatbot.py — AI assistant queries over roster data

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import CurrentUser, require_teacher
from app.services.chatbot_service import execute_plan, plan_with_gpt, summarize_results_gpt

router = APIRouter(prefix="/chatbot", tags=["AI Chatbot"])


class ChatQueryBody(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


@router.post("/query")
def run_chatbot_query(
    body: ChatQueryBody,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_teacher),
) -> Dict[str, Any]:
    plan, plan_error = plan_with_gpt(body.message)
    if not isinstance(plan, dict) or "action" not in plan:
        raise HTTPException(status_code=400, detail="Planner returned invalid payload.")

    rows, action_used = execute_plan(db, plan)

    summary, summary_error = summarize_results_gpt(body.message, action_used, rows)

    response: Dict[str, Any] = {
        "plan": plan,
        "action": action_used,
        "results": rows,
        "summary": summary,
        "meta": {},
    }
    if plan_error:
        response["meta"]["plan_warning"] = plan_error
    if summary_error:
        response["meta"]["summary_warning"] = summary_error

    return response
