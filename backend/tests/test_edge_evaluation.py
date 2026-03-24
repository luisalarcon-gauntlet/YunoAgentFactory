from app.services.orchestration import OrchestrationEngine


def _make_graph_with_edges(conditions):
    """Helper: single source node with multiple outgoing edges."""
    nodes = [
        {"id": "source", "type": "agentNode", "position": {"x": 0, "y": 0},
         "data": {"agent_id": "fake", "label": "Source", "config": {}}},
    ]
    edges = []
    for i, condition in enumerate(conditions):
        target_id = f"target-{i}"
        nodes.append(
            {"id": target_id, "type": "agentNode", "position": {"x": 300, "y": i * 100},
             "data": {"agent_id": "fake", "label": f"Target {i}", "config": {}}}
        )
        edges.append(
            {"id": f"e-{i}", "source": "source", "target": target_id,
             "data": {"condition": condition, "label": condition}}
        )
    return {"nodes": nodes, "edges": edges}


async def test_edge_evaluation_approved():
    graph = _make_graph_with_edges(["approved", "rejected"])
    result = OrchestrationEngine._evaluate_edges(None, graph, "source", "APPROVED: Looks good")
    assert result == ["target-0"]


async def test_edge_evaluation_rejected():
    graph = _make_graph_with_edges(["approved", "rejected"])
    result = OrchestrationEngine._evaluate_edges(None, graph, "source", "REJECTED: Needs work")
    assert result == ["target-1"]


async def test_edge_evaluation_contains():
    graph = _make_graph_with_edges(["contains:error", "contains:success"])
    result = OrchestrationEngine._evaluate_edges(None, graph, "source", "The operation was a success!")
    assert result == ["target-1"]


async def test_edge_evaluation_always():
    graph = _make_graph_with_edges(["always"])
    result = OrchestrationEngine._evaluate_edges(None, graph, "source", "Any output")
    assert result == ["target-0"]


async def test_edge_evaluation_default_fallback():
    graph = _make_graph_with_edges(["approved", "default"])
    result = OrchestrationEngine._evaluate_edges(None, graph, "source", "No signal here")
    assert result == ["target-1"]


async def test_start_node_detection():
    graph = {
        "nodes": [
            {"id": "a", "type": "agentNode", "position": {"x": 0, "y": 0}, "data": {}},
            {"id": "b", "type": "agentNode", "position": {"x": 300, "y": 0}, "data": {}},
            {"id": "c", "type": "agentNode", "position": {"x": 600, "y": 0}, "data": {}},
        ],
        "edges": [
            {"id": "e1", "source": "a", "target": "b", "data": {}},
            {"id": "e2", "source": "b", "target": "c", "data": {}},
        ],
    }
    result = OrchestrationEngine._find_start_nodes(None, graph)
    assert result == ["a"]
