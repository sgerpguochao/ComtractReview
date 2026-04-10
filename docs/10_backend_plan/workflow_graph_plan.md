# Workflow Graph Plan

## Overview
LangGraph StateGraph with 5 nodes: parse_doc → extract_clauses → analyze_risks → hitl_review → apply_decisions

## Graph State
```python
class GraphState(TypedDict):
    task_id: str
    parsed_text: Optional[str]
    clauses: List[Dict[str, Any]]
    risk_items: List[Dict[str, Any]]
    review_decisions: Optional[List[Dict[str, Any]]]
    report: Optional[Dict[str, Any]]
    current_stage: Optional[str]
    progress: int
    error_message: Optional[str]
```

## Nodes
1. **parse_doc**: Uses python-docx (.docx) or PyPDF2 (.pdf) to extract text
2. **extract_clauses**: Regex-based clause splitting, fallback to paragraph splitting
3. **analyze_risks**: Calls DeepSeek LLM (ChatDeepSeek) for each clause, collects risk items
4. **hitl_review**: Calls `langgraph.types.interrupt()` to pause for human review
5. **apply_decisions**: Updates risk_items based on human decisions

## LLM Integration
- Package: `langchain-deepseek`
- Class: `ChatDeepSeek(model="deepseek-chat", api_key=..., temperature=0)`
- Each clause is analyzed independently with a structured JSON prompt

## Checkpoint
- `MemorySaver()` for MVP — stores graph state in memory
- thread_id maps to task_id for 1:1 correspondence
