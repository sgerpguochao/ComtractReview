from app.services.sse_manager import sse_manager


class MockLLM:
    """Mock LLM that returns predefined risk analysis results."""

    def __init__(self):
        self.call_count = 0
        self.responses = self._default_responses()

    def _default_responses(self):
        return [
            {
                "has_risk": True,
                "level": "high",
                "category": "contract_termination",
                "confidence": 92.0,
                "description": "单方无限制解除权，违反公平原则",
                "suggestion": "建议增加双方协商解除条款",
                "legal_basis": "《民法典》第五百六十三条",
            },
            {
                "has_risk": True,
                "level": "medium",
                "category": "breach_of_contract",
                "confidence": 75.0,
                "description": "违约金过高，超出合理范围",
                "suggestion": "建议调整违约金比例",
                "legal_basis": "《民法典》第五百八十五条",
            },
            {
                "has_risk": False,
            },
            {
                "has_risk": True,
                "level": "low",
                "category": "dispute_resolution",
                "confidence": 60.0,
                "description": "争议解决条款约定不明确",
                "suggestion": "明确约定管辖法院",
                "legal_basis": "《民事诉讼法》第三十四条",
            },
        ]

    async def ainvoke(self, messages):
        response_data = self.responses[self.call_count % len(self.responses)]
        self.call_count += 1
        import json

        class MockResponse:
            content = json.dumps(response_data, ensure_ascii=False)

        return MockResponse()
