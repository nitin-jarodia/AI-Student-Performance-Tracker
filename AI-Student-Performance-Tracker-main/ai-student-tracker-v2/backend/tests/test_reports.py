"""Custom reports and template API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_report_templates_require_auth(client: TestClient) -> None:
    client.cookies.clear()
    response = client.get("/reports/templates")
    assert response.status_code == 401


def test_teacher_can_list_report_templates(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.get("/reports/templates", headers=admin_headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "templates" in payload
    assert isinstance(payload["templates"], list)


def test_custom_report_requires_existing_student(
    client: TestClient,
    admin_headers: dict[str, str],
) -> None:
    response = client.post(
        "/reports/custom",
        headers=admin_headers,
        json={"student_id": 999999, "blocks": ["summary"], "filters": {}},
    )
    assert response.status_code == 404
