# Test Plan

## Test Categories
1. **Upload Tests** (C1-C4): File format validation, size limits, duplicate detection
2. **Task Tests** (C9, C20): Task query, list, cancel
3. **Review Tests** (C12-C16): Single approve/reject/modify, batch operations, remaining_pending
4. **Report Tests** (C17-C18): Report generation, PDF download

## Mock LLM
`tests/mock_llm.py` provides a MockLLM class that returns predefined risk analysis results, avoiding real API calls during testing.

## MVP Testing Approach
Since the full E2E flow requires the LangGraph graph to execute (which uses the real LLM), MVP testing focuses on:
1. API endpoint contract validation (request/response schemas)
2. State machine transitions
3. Error handling (all error codes from spec)
4. File upload/download

Full E2E tests with mock LLM are defined but marked as placeholders pending graph integration test setup.
