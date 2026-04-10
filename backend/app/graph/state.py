from typing import TypedDict, List, Dict, Any, Optional


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
    sse_events: List[Dict[str, Any]]
