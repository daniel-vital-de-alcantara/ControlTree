"""Split search and model-training helpers for decision tree workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.tree import DecisionTreeClassifier, export_graphviz

from .config import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MAX_NUMERIC_THRESHOLDS,
    DEFAULT_MIN_SAMPLES_LEAF,
    DEFAULT_TOP_N_SPLITS,
)
from .evaluation import gini_impurity, summarize_classifier_predictions
from .schema import SplitCandidate, VariableSuggestion


def find_best_splits(
    df: pd.DataFrame,
    target_col: str,
    top_n: int = DEFAULT_TOP_N_SPLITS,
    min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF,
    max_numeric_thresholds: int = DEFAULT_MAX_NUMERIC_THRESHOLDS,
    exclude_cols: list[str] | None = None,
    only_feature: str | None = None,
) -> list[SplitCandidate]:
    """Score candidate one-step splits by Gini gain.

    Parameters
    ----------
    df : pandas.DataFrame
        Input tabular dataset.
    target_col : str
        Target column used to compute impurity reduction.
    top_n : int, default 10
        Maximum number of candidate splits to return.
    min_samples_leaf : int, default 20
        Minimum number of rows allowed in each child branch.
    max_numeric_thresholds : int, default 20
        Number of quantile-based thresholds to test for numeric features.
    exclude_cols : list of str, optional
        Columns to exclude from candidate generation.
    only_feature : str, optional
        Restrict evaluation to a single feature.

    Returns
    -------
    list of dict
        Split candidates sorted by descending gain.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.builders import find_best_splits
    >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
    >>> isinstance(find_best_splits(df, "y", min_samples_leaf=1), list)
    True
    """
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' not found.")

    parent = df[target_col]
    parent_impurity = gini_impurity(parent)
    total = len(df)
    candidates: list[SplitCandidate] = []

    excluded = set(exclude_cols or [])
    excluded.add(target_col)
    features = [c for c in df.columns if c not in excluded]
    if only_feature is not None:
        features = [c for c in features if c == only_feature]

    for feature in features:
        col = df[feature]

        if pd.api.types.is_bool_dtype(col):
            values = [bool(category) for category in col.value_counts(dropna=True).index.tolist()]
            kind = "categorical"
            operator = "=="
            for value in values:
                _append_binary_candidate(
                    candidates,
                    df=df,
                    target_col=target_col,
                    feature=feature,
                    kind=kind,
                    operator=operator,
                    value=value,
                    total=total,
                    parent_impurity=parent_impurity,
                    min_samples_leaf=min_samples_leaf,
                )
        elif pd.api.types.is_numeric_dtype(col):
            values = col.dropna().to_numpy()
            if len(values) < (2 * min_samples_leaf):
                continue
            quantiles = np.linspace(0.05, 0.95, max_numeric_thresholds)
            thresholds = np.unique(np.quantile(values, quantiles))
            for threshold in thresholds:
                _append_binary_candidate(
                    candidates,
                    df=df,
                    target_col=target_col,
                    feature=feature,
                    kind="numeric",
                    operator="<=",
                    value=float(threshold),
                    total=total,
                    parent_impurity=parent_impurity,
                    min_samples_leaf=min_samples_leaf,
                )
        else:
            for category in col.value_counts(dropna=True).index.tolist():
                _append_binary_candidate(
                    candidates,
                    df=df,
                    target_col=target_col,
                    feature=feature,
                    kind="categorical",
                    operator="==",
                    value=category,
                    total=total,
                    parent_impurity=parent_impurity,
                    min_samples_leaf=min_samples_leaf,
                )

    candidates.sort(key=lambda x: x["gain"], reverse=True)
    return candidates[:top_n]


def suggest_best_split_variables(
    df: pd.DataFrame,
    target_col: str,
    *,
    top_n: int = DEFAULT_TOP_N_SPLITS,
    min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF,
    max_numeric_thresholds: int = DEFAULT_MAX_NUMERIC_THRESHOLDS,
    exclude_cols: list[str] | None = None,
) -> list[VariableSuggestion]:
    """Rank variables by the gain of their best available split.

    Parameters
    ----------
    df : pandas.DataFrame
        Input tabular dataset.
    target_col : str
        Target column used to compute impurity reduction.
    top_n : int, default 10
        Maximum number of ranked variables to return.
    min_samples_leaf : int, default 20
        Minimum number of rows allowed in each child branch.
    max_numeric_thresholds : int, default 20
        Number of quantile-based thresholds to test for numeric features.
    exclude_cols : list of str, optional
        Columns to exclude from candidate generation.

    Returns
    -------
    list of dict
        Ranked variable summaries sorted by descending best gain.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.builders import suggest_best_split_variables
    >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
    >>> isinstance(suggest_best_split_variables(df, "y", min_samples_leaf=1), list)
    True
    """
    all_candidates = find_best_splits(
        df,
        target_col=target_col,
        top_n=100000,
        min_samples_leaf=min_samples_leaf,
        max_numeric_thresholds=max_numeric_thresholds,
        exclude_cols=exclude_cols,
    )

    by_feature: dict[str, list[SplitCandidate]] = {}
    for candidate in all_candidates:
        by_feature.setdefault(candidate["feature"], []).append(candidate)

    ranked: list[VariableSuggestion] = []
    for feature, items in by_feature.items():
        best = max(items, key=lambda x: x["gain"])
        ranked.append(
            {
                "feature": feature,
                "best_gain": float(best["gain"]),
                "best_cutpoint": best.get("cutpoint", best.get("value")),
                "best_rule": f"{best['feature']} {best['operator']} {best['value']}",
                "candidate_count": len(items),
            }
        )

    ranked.sort(key=lambda x: x["best_gain"], reverse=True)
    return ranked[:top_n]


def choose_split(splits: list[SplitCandidate], index: int) -> SplitCandidate:
    """Choose one split using a 1-based index.

    Parameters
    ----------
    splits : list of dict
        Candidate split list.
    index : int
        One-based split position.

    Returns
    -------
    dict
        The selected split candidate.

    Examples
    --------
    >>> from magicroot.decision_trees.builders import choose_split
    >>> choose_split([{"feature": "x"}], 1)["feature"]
    'x'
    """
    if index < 1 or index > len(splits):
        raise IndexError(f"Split index must be between 1 and {len(splits)}.")
    return splits[index - 1]


def apply_split(df: pd.DataFrame, split: SplitCandidate) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Apply a chosen split and return left/right partitions.

    Parameters
    ----------
    df : pandas.DataFrame
        Input data to partition.
    split : dict
        Split candidate containing ``feature``, ``operator``, and ``value``.

    Returns
    -------
    tuple of pandas.DataFrame
        Left and right partitions produced by the split.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.builders import apply_split
    >>> df = pd.DataFrame({"x": [1, 2, 3]})
    >>> left, right = apply_split(df, {"feature": "x", "operator": "<=", "value": 2})
    >>> (len(left), len(right))
    (2, 1)
    """
    feature = split["feature"]
    if split["operator"] == "<=":
        mask = df[feature] <= split["value"]
    elif split["operator"] == "==":
        mask = df[feature] == split["value"]
    else:
        raise ValueError(f"Unsupported operator: {split['operator']}")
    return df[mask].copy(), df[~mask].copy()


def train_and_export_graphviz_tree(
    df: pd.DataFrame,
    target_col: str,
    png_path: str | Path,
    max_depth: int = DEFAULT_MAX_DEPTH,
    min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF,
    exclude_cols_for_training: list[str] | None = None,
) -> None:
    """Train a scikit-learn tree and export a Graphviz PNG.

    Parameters
    ----------
    df : pandas.DataFrame
        Input tabular dataset.
    target_col : str
        Target column used for model training.
    png_path : str or pathlib.Path
        Output path for the rendered PNG.
    max_depth : int, default 4
        Maximum depth passed to ``DecisionTreeClassifier``.
    min_samples_leaf : int, default 20
        Minimum number of rows allowed in each terminal node.
    exclude_cols_for_training : list of str, optional
        Columns to drop before training.

    Returns
    -------
    None

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.builders import train_and_export_graphviz_tree
    >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
    >>> train_and_export_graphviz_tree(df, "y", "tree.png", min_samples_leaf=1)  # doctest: +SKIP
    """
    excluded = set(exclude_cols_for_training or [])
    excluded.add(target_col)
    X = df.drop(columns=[c for c in df.columns if c in excluded])
    y = df[target_col]

    numeric_cols = X.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [c for c in X.columns if c not in numeric_cols]

    prep = ColumnTransformer(
        transformers=[
            ("num", Pipeline([("imp", SimpleImputer(strategy="median"))]), numeric_cols),
            (
                "cat",
                Pipeline(
                    [
                        ("imp", SimpleImputer(strategy="most_frequent")),
                        ("ohe", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical_cols,
            ),
        ]
    )

    model = DecisionTreeClassifier(
        max_depth=max_depth,
        min_samples_leaf=min_samples_leaf,
        random_state=42,
    )
    pipe = Pipeline([("prep", prep), ("model", model)])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    pipe.fit(X_train, y_train)
    metrics = summarize_classifier_predictions(y_test, pipe.predict(X_test))
    print(f"\nAccuracy: {metrics['accuracy']:.4f}")
    print(metrics["classification_report"])

    feature_names = pipe.named_steps["prep"].get_feature_names_out()
    tree_model = pipe.named_steps["model"]
    dot_data = export_graphviz(
        tree_model,
        out_file=None,
        feature_names=feature_names,
        class_names=[str(v) for v in sorted(y.unique())],
        filled=True,
        rounded=True,
        special_characters=True,
    )

    try:
        import graphviz

        output = Path(png_path)
        graph = graphviz.Source(dot_data)
        graph.format = "png"
        graph.render(filename=output.stem, directory=str(output.parent), cleanup=True)
        print(f"Saved Graphviz tree to: {output}")
    except Exception as exc:  # pragma: no cover
        print(
            "Could not render PNG with Graphviz. "
            "Install python package `graphviz` and Graphviz system binary `dot`.\n"
            f"Reason: {exc}"
        )


def _append_binary_candidate(
    candidates: list[SplitCandidate],
    *,
    df: pd.DataFrame,
    target_col: str,
    feature: str,
    kind: str,
    operator: str,
    value: Any,
    total: int,
    parent_impurity: float,
    min_samples_leaf: int,
) -> None:
    """Append a binary split candidate when both branches satisfy leaf-size rules."""
    if operator == "<=":
        left_mask = df[feature] <= value
        cutpoint = float(value)
    else:
        left_mask = df[feature] == value
        cutpoint = None

    right_mask = ~left_mask
    left_n = int(left_mask.sum())
    right_n = int(right_mask.sum())
    if left_n < min_samples_leaf or right_n < min_samples_leaf:
        return

    left_y = df.loc[left_mask, target_col]
    right_y = df.loc[right_mask, target_col]
    weighted_impurity = (left_n / total) * gini_impurity(left_y) + (
        right_n / total
    ) * gini_impurity(right_y)
    candidate: SplitCandidate = {
        "feature": feature,
        "kind": kind,
        "operator": operator,
        "value": value,
        "gain": float(parent_impurity - weighted_impurity),
        "left_n": left_n,
        "right_n": right_n,
    }
    if cutpoint is not None:
        candidate["cutpoint"] = cutpoint
    candidates.append(candidate)
