from typing import Dict, Any, List
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import interrupt

from app.graph.state import GraphState


def hitl_review(state: GraphState) -> Dict[str, Any]:
    """Interrupt for human-in-the-loop review."""
    risk_items = state.get("risk_items", [])
    high_items = [r for r in risk_items if r.get("level") == "high"]

    interrupt_value = {
        "type": "human_review",
        "context": {
            "risk_items": risk_items,
            "high_count": len(high_items),
            "medium_count": sum(1 for r in risk_items if r.get("level") == "medium"),
            "low_count": sum(1 for r in risk_items if r.get("level") == "low"),
        },
    }

    # This will pause graph execution
    decisions = interrupt(interrupt_value)

    return {
        "review_decisions": decisions,
        "current_stage": "human_reviewing",
    }


def apply_decisions(state: GraphState) -> Dict[str, Any]:
    """Apply human review decisions to risk items."""
    decisions = state.get("review_decisions") or []
    risk_items = state.get("risk_items", [])

    decision_map = {d.get("risk_id"): d for d in decisions}

    for item in risk_items:
        risk_id = item.get("risk_id") or item.get("id", "")
        if risk_id in decision_map:
            decision = decision_map[risk_id]
            action = decision.get("action")
            status_map = {"approve": "approved", "modify": "modified", "reject": "rejected"}
            item["human_review_status"] = status_map.get(action, "pending")

            if action == "modify" and "modified_content" in decision:
                modified = decision["modified_content"]
                for key in ["level", "description", "suggestion", "legal_basis"]:
                    if modified.get(key):
                        item[key] = modified[key]

    return {
        "risk_items": risk_items,
        "current_stage": "report_ready",
        "progress": 100,
    }


def build_graph() -> StateGraph:
    """Build the LangGraph review workflow."""
    workflow = StateGraph(GraphState)

    # Add nodes
    workflow.add_node("parse_doc", parse_doc_node)
    workflow.add_node("extract_clauses", extract_clauses_node)
    workflow.add_node("analyze_risks", analyze_risks_node)
    workflow.add_node("hitl_review", hitl_review_node)
    workflow.add_node("apply_decisions", apply_decisions_node)

    # Add edges
    workflow.add_edge("__START__", "parse_doc")
    workflow.add_edge("parse_doc", "extract_clauses")
    workflow.add_edge("extract_clauses", "analyze_risks")
    workflow.add_edge("analyze_risks", "hitl_review")
    workflow.add_edge("hitl_review", "apply_decisions")
    workflow.add_edge("apply_decisions", "__END__")

    # Setup checkpoint
    checkpointer = MemorySaver()
    graph = workflow.compile(checkpointer=checkpointer)

    return graph


# Wrapper functions that work with langgraph's node signature
async def parse_doc_node(state: GraphState) -> Dict[str, Any]:
    from app.graph.nodes import parse_doc
    return await parse_doc(state)


async def extract_clauses_node(state: GraphState) -> Dict[str, Any]:
    from app.graph.nodes import extract_clauses
    return await extract_clauses(state)


async def analyze_risks_node(state: GraphState) -> Dict[str, Any]:
    from app.graph.nodes import analyze_risks
    return await analyze_risks(state)


def hitl_review_node(state: GraphState) -> Dict[str, Any]:
    return hitl_review(state)


def apply_decisions_node(state: GraphState) -> Dict[str, Any]:
    return apply_decisions(state)


# Singleton graph instance
_review_graph = None


def get_graph():
    global _review_graph
    if _review_graph is None:
        _review_graph = build_graph()
    return _review_graph
