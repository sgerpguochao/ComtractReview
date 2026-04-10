import io
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from main import app
from app.database import init_db


@pytest_asyncio.fixture
async def client():
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def uploaded_task(client, sample_docx_content):
    """Create an uploaded task for testing."""
    response = await client.post(
        "/api/v1/tasks/upload",
        files={"file": ("test_contract.docx", io.BytesIO(sample_docx_content), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    return response.json()


@pytest.mark.asyncio
async def test_get_task(client, uploaded_task):
    """Test get task by ID."""
    task_id = uploaded_task["task_id"]
    response = await client.get(f"/api/v1/tasks/{task_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == task_id
    assert data["file_name"] == "test_contract.docx"


@pytest.mark.asyncio
async def test_get_task_not_found(client):
    """Test get non-existent task."""
    response = await client.get("/api/v1/tasks/nonexistent-id")
    assert response.status_code == 404
    data = response.json()
    assert data["code"] == "TASK_NOT_FOUND"


@pytest.mark.asyncio
async def test_list_tasks(client, uploaded_task):
    """Test list tasks."""
    response = await client.get("/api/v1/tasks")
    assert response.status_code == 200
    data = response.json()
    assert "tasks" in data
    assert len(data["tasks"]) >= 1


@pytest.mark.asyncio
async def test_cancel_task(client, uploaded_task):
    """C20: Cancel task."""
    task_id = uploaded_task["task_id"]
    response = await client.post(f"/api/v1/tasks/{task_id}/cancel")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "cancelled"


@pytest.mark.asyncio
async def test_cancel_already_cancelled(client, uploaded_task):
    """Test cancel already cancelled task."""
    task_id = uploaded_task["task_id"]
    await client.post(f"/api/v1/tasks/{task_id}/cancel")
    response = await client.post(f"/api/v1/tasks/{task_id}/cancel")
    assert response.status_code == 409
    data = response.json()
    assert data["code"] == "TASK_NOT_CANCELLABLE"
