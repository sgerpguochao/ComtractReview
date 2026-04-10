import os
import sys
import tempfile
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Add parent dir to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ["DEEPSEEK_API_KEY"] = "test-key"


@pytest.fixture
def test_env():
    """Setup test environment."""
    os.environ["DEEPSEEK_API_KEY"] = "test-key"
    yield


@pytest.fixture
def sample_docx_content():
    """Generate minimal .docx content for testing."""
    from docx import Document
    import io

    doc = Document()
    doc.add_paragraph("第一条 合同双方")
    doc.add_paragraph("甲方：测试公司")
    doc.add_paragraph("乙方：测试个人")
    doc.add_paragraph("第二条 合同期限")
    doc.add_paragraph("本合同有效期为一年。")
    doc.add_paragraph("第三条 违约责任")
    doc.add_paragraph("甲方有权单方面解除合同，无需承担违约责任。")
    doc.add_paragraph("第四条 争议解决")
    doc.add_paragraph("双方协商解决，协商不成的提交仲裁委员会。")

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


@pytest.fixture
def sample_pdf_content():
    """Minimal PDF content for testing."""
    # A minimal valid PDF
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
