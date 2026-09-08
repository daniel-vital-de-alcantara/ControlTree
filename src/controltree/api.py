"""Local HTTP API for the ControlTree browser workbench."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, model_validator

from .builders import apply_split
from .tree import TreeModel


MAX_ROWS = 50_000
MAX_COLUMNS = 250


class TableRequest(BaseModel):
    """Tabular data optionally narrowed to one tree node."""

    columns: list[str] = Field(min_length=1, max_length=MAX_COLUMNS)
    rows: list[list[Any]] = Field(min_length=2, max_length=MAX_ROWS)
    row_indices: list[int] | None = None

    @model_validator(mode="after")
    def validate_table(self) -> "TableRequest":
        if len(set(self.columns)) != len(self.columns):
            raise ValueError("Column names must be unique.")
        if any(len(row) > len(self.columns) for row in self.rows):
            raise ValueError("A data row contains more values than the header.")
        if self.row_indices is not None:
            if len(set(self.row_indices)) != len(self.row_indices):
                raise ValueError("Node row indices must be unique.")
            if any(index < 0 or index >= len(self.rows) for index in self.row_indices):
                raise ValueError("A node row index is outside the dataset.")
        return self


class SuggestionRequest(TableRequest):
    """Tabular data and the optional workflow's recommendation target."""

    target: str

    @model_validator(mode="after")
    def validate_target(self) -> "SuggestionRequest":
        if self.target not in self.columns:
            raise ValueError("Target column was not found.")
        return self


class SuggestionResponse(BaseModel):
    """Serializable split candidate used by the React workbench."""

    id: str
    feature: str
    operator: str
    value: str | int | float | bool
    gain: float
    criterion: str
    left_count: int
    right_count: int
    left_row_indices: list[int]
    right_row_indices: list[int]


class ManualSplitRequest(TableRequest):
    """A caller-defined numeric or categorical multiway split."""

    feature: str
    values: list[str | int | float | bool] = Field(min_length=1, max_length=20)
    force_categorical: bool = False
    include_other: bool = True

    @model_validator(mode="after")
    def validate_feature(self) -> "ManualSplitRequest":
        if self.feature not in self.columns:
            raise ValueError("Split variable was not found.")
        return self


class ManualBranchResponse(BaseModel):
    """One child created by a manual split."""

    label: str
    count: int
    row_indices: list[int]


class ManualSplitResponse(BaseModel):
    """Materialized branches for a caller-defined split."""

    feature: str
    branches: list[ManualBranchResponse]


class SavedSplit(BaseModel):
    """A data-independent split rule stored in a ControlTree project file."""

    kind: str
    feature: str
    operator: str | None = None
    value: str | int | float | bool | None = None
    values: list[str | int | float | bool] | None = None
    force_categorical: bool = False
    include_other: bool = True

    @model_validator(mode="after")
    def validate_rule(self) -> "SavedSplit":
        if self.kind == "binary":
            if self.operator not in {"<=", "=="} or self.value is None:
                raise ValueError("A saved binary split needs an operator and value.")
        elif self.kind == "manual":
            if not self.values:
                raise ValueError("A saved manual split needs at least one value.")
        else:
            raise ValueError(f"Unsupported saved split kind: {self.kind}")
        return self


class SavedTreeNode(BaseModel):
    """Tree shape and split rules without dataset rows or computed summaries."""

    split: SavedSplit | None = None
    children: list["SavedTreeNode"] = Field(default_factory=list)


class ReplayTreeRequest(TableRequest):
    """A dataset plus a saved tree definition to materialize against it."""

    tree: SavedTreeNode


app = FastAPI(title="ControlTree API", version="0.1.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    """Report that the local API is available."""
    return {"status": "ok"}


def _plain_value(value: Any) -> str | float | bool:
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, (str, bool)):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    return str(value)


def _display_rule(split: SavedSplit) -> str:
    value = f"“{split.value}”" if isinstance(split.value, str) else str(split.value)
    return f"{split.feature} {split.operator} {value}"


def _is_regression_target(series: pd.Series) -> bool:
    return pd.api.types.is_numeric_dtype(series) and series.nunique(dropna=True) > 20


def _find_regression_splits(
    frame: pd.DataFrame,
    target: str,
    min_samples_leaf: int,
    top_n: int = 8,
) -> list[dict[str, Any]]:
    """Rank one-step splits by reduction in target variance."""
    target_values = pd.to_numeric(frame[target], errors="coerce")
    observed_total = int(target_values.notna().sum())
    if observed_total < 2:
        return []
    parent_variance = float(target_values.dropna().var(ddof=0))
    candidates: list[dict[str, Any]] = []

    def append_candidate(feature: str, operator: str, value: Any, mask: pd.Series) -> None:
        left = frame.loc[mask]
        right = frame.loc[~mask]
        if len(left) < min_samples_leaf or len(right) < min_samples_leaf:
            return
        left_target = pd.to_numeric(left[target], errors="coerce").dropna()
        right_target = pd.to_numeric(right[target], errors="coerce").dropna()
        if left_target.empty or right_target.empty:
            return
        weighted = (
            (len(left_target) / observed_total) * float(left_target.var(ddof=0))
            + (len(right_target) / observed_total) * float(right_target.var(ddof=0))
        )
        candidates.append(
            {
                "feature": feature,
                "operator": operator,
                "value": value,
                "gain": parent_variance - weighted,
                "left_n": len(left),
                "right_n": len(right),
            }
        )

    for feature in (column for column in frame.columns if column != target):
        series = frame[feature]
        if pd.api.types.is_numeric_dtype(series) and not pd.api.types.is_bool_dtype(series):
            values = series.dropna().to_numpy()
            if len(values) < 2 * min_samples_leaf:
                continue
            for threshold in np.unique(np.quantile(values, np.linspace(0.05, 0.95, 20))):
                append_candidate(feature, "<=", float(threshold), series <= threshold)
        else:
            for value in series.value_counts(dropna=True).index.tolist():
                append_candidate(feature, "==", value, series == value)

    candidates.sort(key=lambda candidate: candidate["gain"], reverse=True)
    return candidates[:top_n]


@app.post("/api/suggestions", response_model=list[SuggestionResponse])
def suggest_splits(payload: SuggestionRequest) -> list[SuggestionResponse]:
    """Rank genuine one-step splits using the package's Gini-gain logic."""
    padded_rows = [row + [None] * (len(payload.columns) - len(row)) for row in payload.rows]
    frame = pd.DataFrame(padded_rows, columns=payload.columns)
    node_frame = frame if payload.row_indices is None else frame.iloc[payload.row_indices]
    if len(node_frame) < 2:
        return []
    min_samples_leaf = min(20, max(1, len(node_frame) // 10))

    try:
        regression = _is_regression_target(node_frame[payload.target])
        if regression:
            candidates = _find_regression_splits(node_frame, payload.target, min_samples_leaf)
        else:
            model = TreeModel(node_frame).set_target(
                payload.target,
                min_samples_leaf=min_samples_leaf,
            )
            candidates = model.suggest_splits(top_n=8)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    responses: list[SuggestionResponse] = []
    for index, candidate in enumerate(candidates, start=1):
        left, right = apply_split(node_frame, candidate)
        responses.append(
            SuggestionResponse(
                id=f"{candidate['feature']}-{index}",
                feature=candidate["feature"],
                operator=candidate["operator"],
                value=_plain_value(candidate["value"]),
                gain=float(candidate["gain"]),
                criterion="Variance reduction" if regression else "Gini gain",
                left_count=int(candidate["left_n"]),
                right_count=int(candidate["right_n"]),
                left_row_indices=[int(value) for value in left.index],
                right_row_indices=[int(value) for value in right.index],
            )
        )
    return responses


@app.post("/api/manual-split", response_model=ManualSplitResponse)
def create_manual_split(payload: ManualSplitRequest) -> ManualSplitResponse:
    """Apply a numeric or categorical split with caller-defined branches."""
    padded_rows = [row + [None] * (len(payload.columns) - len(row)) for row in payload.rows]
    frame = pd.DataFrame(padded_rows, columns=payload.columns)
    node_frame = frame if payload.row_indices is None else frame.iloc[payload.row_indices]

    try:
        model = TreeModel(node_frame).set_target(payload.feature, min_samples_leaf=1)
        child_ids = model.confirm_manual_split(
            "root",
            feature=payload.feature,
            categories=payload.values,
            force_categorical=payload.force_categorical,
            include_other=payload.include_other,
            other_label="Other / missing",
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    branches = []
    for child_id in child_ids:
        child = model.nodes[child_id]
        branches.append(
            ManualBranchResponse(
                label=child.branch_label or child_id,
                count=len(child.row_index),
                row_indices=[int(value) for value in child.row_index],
            )
        )
    return ManualSplitResponse(feature=payload.feature, branches=branches)


@app.post("/api/replay-tree")
def replay_tree(payload: ReplayTreeRequest) -> dict[str, Any]:
    """Reapply a saved, data-free tree definition to a compatible dataset."""
    padded_rows = [row + [None] * (len(payload.columns) - len(row)) for row in payload.rows]
    frame = pd.DataFrame(padded_rows, columns=payload.columns)

    def materialize(
        saved: SavedTreeNode,
        node_frame: pd.DataFrame,
        node_id: str,
        title: str,
        branch_label: str | None = None,
    ) -> dict[str, Any]:
        node: dict[str, Any] = {
            "id": node_id,
            "title": title,
            "samples": len(node_frame),
            "row_indices": [int(value) for value in node_frame.index],
            "children": [],
        }
        if branch_label is not None:
            node["branch_label"] = branch_label
        if saved.split is None:
            return node
        if saved.split.feature not in frame.columns:
            raise ValueError(f"Split variable '{saved.split.feature}' was not found in this dataset.")
        if len(saved.children) < 2:
            raise ValueError("A saved split must have at least two child nodes.")

        split = saved.split
        node["split"] = split.model_dump()
        parts: list[tuple[str, pd.DataFrame]]
        if split.kind == "binary":
            left, right = apply_split(
                node_frame,
                {"feature": split.feature, "operator": split.operator, "value": split.value},
            )
            rule = _display_rule(split)
            parts = [(rule, left), (f"not ({rule})", right)]
        else:
            model = TreeModel(node_frame).set_target(split.feature, min_samples_leaf=1)
            child_ids = model.confirm_manual_split(
                "root",
                feature=split.feature,
                categories=split.values,
                force_categorical=split.force_categorical,
                include_other=split.include_other,
                other_label="Other / missing",
            )
            parts = [
                (
                    model.nodes[child_id].branch_label or child_id,
                    frame.loc[model.nodes[child_id].row_index],
                )
                for child_id in child_ids
            ]

        if len(parts) != len(saved.children) or any(part.empty for _, part in parts):
            raise ValueError(
                f"The saved split on '{split.feature}' does not produce the same branches "
                "with this dataset. Check that this is a compatible data version."
            )
        node["children"] = [
            materialize(
                child,
                part,
                f"{node_id}.{index}",
                "Matching rows" if split.kind == "binary" and index == 1 else
                "Remaining rows" if split.kind == "binary" and index == 2 else
                f"Branch {index}",
                label,
            )
            for index, (child, (label, part)) in enumerate(
                zip(saved.children, parts, strict=True), start=1
            )
        ]
        return node

    try:
        return materialize(payload.tree, frame, "root", "All rows")
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
