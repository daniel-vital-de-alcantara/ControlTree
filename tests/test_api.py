"""Tests for the local browser-workbench API."""

from fastapi.testclient import TestClient

from controltree.api import app


def test_suggestions_use_uploaded_table() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/suggestions",
        json={
            "columns": ["age", "group", "outcome"],
            "rows": [
                [18, "a", 0],
                [20, "a", 0],
                [22, "a", 0],
                [48, "b", 1],
                [51, "b", 1],
                [55, "b", 1],
            ],
            "target": "outcome",
        },
    )

    assert response.status_code == 200
    suggestions = response.json()
    assert suggestions
    assert suggestions[0]["feature"] in {"age", "group"}
    assert suggestions[0]["left_count"] + suggestions[0]["right_count"] == 6
    assert sorted(
        suggestions[0]["left_row_indices"] + suggestions[0]["right_row_indices"]
    ) == list(range(6))


def test_suggestions_can_score_one_existing_node() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/suggestions",
        json={
            "columns": ["age", "segment", "outcome"],
            "rows": [
                [18, "a", 0],
                [20, "a", 0],
                [22, "b", 1],
                [48, "a", 0],
                [51, "b", 1],
                [55, "b", 1],
            ],
            "target": "outcome",
            "row_indices": [0, 1, 2],
        },
    )

    assert response.status_code == 200
    suggestions = response.json()
    assert suggestions
    for suggestion in suggestions:
        indices = suggestion["left_row_indices"] + suggestion["right_row_indices"]
        assert sorted(indices) == [0, 1, 2]


def test_manual_numeric_split_can_create_more_than_two_children() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/manual-split",
        json={
            "columns": ["age", "outcome"],
            "rows": [[18, 0], [24, 0], [35, 1], [45, 1], [67, 0]],
            "row_indices": [0, 1, 2, 3, 4],
            "feature": "age",
            "values": [30, 50],
            "include_other": True,
        },
    )

    assert response.status_code == 200
    branches = response.json()["branches"]
    assert [branch["label"] for branch in branches] == ["<=30", "(30, 50]", ">50"]
    assert [branch["count"] for branch in branches] == [2, 2, 1]


def test_continuous_target_uses_average_and_variance_reduction() -> None:
    client = TestClient(app)
    rows = [[index, "early" if index < 15 else "late", float(index * 3)] for index in range(30)]
    response = client.post(
        "/api/suggestions",
        json={"columns": ["day", "period", "revenue"], "rows": rows, "target": "revenue"},
    )

    assert response.status_code == 200
    suggestions = response.json()
    assert suggestions
    assert suggestions[0]["criterion"] == "Variance reduction"


def test_saved_tree_replays_against_new_rows() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/replay-tree",
        json={
            "columns": ["age", "outcome"],
            "rows": [[20, 10.0], [29, 20.0], [35, 30.0], [51, 40.0]],
            "tree": {
                "split": {"kind": "binary", "feature": "age", "operator": "<=", "value": 30},
                "children": [{"children": []}, {"children": []}],
            },
        },
    )

    assert response.status_code == 200
    tree = response.json()
    assert "target_label" not in tree
    assert [child["samples"] for child in tree["children"]] == [2, 2]
    assert tree["children"][0]["row_indices"] == [0, 1]


def test_manual_split_does_not_need_a_target_column() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/manual-split",
        json={
            "columns": ["segment"],
            "rows": [["a"], ["a"], ["b"]],
            "feature": "segment",
            "values": ["a"],
            "include_other": True,
        },
    )

    assert response.status_code == 200
    assert [branch["count"] for branch in response.json()["branches"]] == [2, 1]
