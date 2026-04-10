# HITL Flow Plan

## Interrupt Mechanism
After `analyze_risks` completes, the graph calls `interrupt()` with:
```python
{
    "type": "human_review",
    "context": {
        "risk_items": [...],
        "high_count": N,
        "medium_count": M,
        "low_count": K,
    }
}
```

## Resume Flow
User submits decisions via API → `Command(resume={"decisions": [...]})` → `apply_decisions` node processes them.

## SSE Events
- `status_change`: Task status updates
- `progress`: Stage progress updates
- `stage_change`: Stage transitions
- `review_pending`: AI review complete, waiting for human
- `completed`: Full pipeline done
- `error`: Something failed

## Session Timeout
24-hour default timeout. After timeout, graph can be resumed or restarted.
