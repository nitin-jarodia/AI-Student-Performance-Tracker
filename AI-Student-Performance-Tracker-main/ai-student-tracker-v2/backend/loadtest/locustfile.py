"""Load test for class analytics (N+1 fixed endpoint).

Run against a local API (docker-compose or uvicorn):

    pip install -r requirements-dev.txt
    locust -f loadtest/locustfile.py --host=http://localhost:8000

Then open http://localhost:8089, set users/ramp-up, or headless:

    locust -f loadtest/locustfile.py --host=http://localhost:8000 \\
        --headless -u 50 -r 10 -t 60s --html loadtest/report.html

Set ``LOCUST_ADMIN_EMAIL`` / ``LOCUST_ADMIN_PASSWORD`` env vars if not using defaults.
"""

from __future__ import annotations

import os

from locust import HttpUser, between, task


class AnalyticsUser(HttpUser):
    wait_time = between(0.5, 1.5)

    def on_start(self) -> None:
        email = os.getenv("LOCUST_ADMIN_EMAIL", "admin@school.com")
        password = os.getenv("LOCUST_ADMIN_PASSWORD", "Admin@123")
        response = self.client.post("/auth/login", json={"email": email, "password": password})
        if response.status_code != 200:
            raise RuntimeError(f"Login failed: {response.status_code} {response.text}")
        token = response.json()["access_token"]
        self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task(3)
    def class_analytics(self) -> None:
        self.client.get("/ml/class-analytics", name="/ml/class-analytics")

    @task(2)
    def performance_summary(self) -> None:
        self.client.get("/performance/summary/all", name="/performance/summary/all")

    @task(1)
    def health(self) -> None:
        self.client.get("/health", name="/health")
