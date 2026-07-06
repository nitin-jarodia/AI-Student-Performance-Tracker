"""Chatbot planner + execution tests (heuristic fallback)."""

from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient


def test_chatbot_requires_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.post("/chatbot/query", json={"message": "list all students"})
    assert response.status_code == 401


def test_chatbot_list_students_heuristic(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    plan = {"action": "filter_students", "filters": {}, "limit": 25}

    with patch("app.routes.chatbot.plan_with_gpt", return_value=(plan, None)):
        with patch(
            "app.routes.chatbot.summarize_results_gpt",
            return_value=("Found students in roster.", None),
        ):
            response = client.post(
                "/chatbot/query",
                headers=admin_headers,
                json={"message": "list all students"},
            )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["action"] == "filter_students"
    assert "results" in payload
    assert isinstance(payload["results"], list)
    assert payload["summary"]
