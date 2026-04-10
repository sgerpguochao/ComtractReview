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


@pytest.mark.asyncio
async def test_upload_docx(client, sample_docx_content):
    """C1: Upload .docx file successfully."""
    response = await client.post(
        "/api/v1/tasks/upload",
        files={"file": ("test_contract.docx", io.BytesIO(sample_docx_content), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data
    assert data["status"] == "uploaded"


@pytest.mark.asyncio
async def test_upload_pdf(client, sample_pdf_content):
    """C2: Upload .pdf file successfully."""
    response = await client.post(
        "/api/v1/tasks/upload",
        files={"file": ("test_contract.pdf", io.BytesIO(sample_pdf_content), "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "task_id" in data


@pytest.mark.asyncio
async def test_upload_invalid_type(client):
    """C3: Upload non-supported format."""
    response = await client.post(
        "/api/v1/tasks/upload",
        files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == "INVALID_FILE_TYPE"


@pytest.mark.asyncio
async def test_upload_empty_file(client):
    """C4: Upload empty file."""
    response = await client.post(
        "/api/v1/tasks/upload",
        files={"file": ("empty.docx", io.BytesIO(b""), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["code"] == "EMPTY_FILE"
