"""High-level convenience workflows for the decision tree package."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from .builders import (
    apply_split,
    choose_split,
    find_best_splits,
    suggest_best_split_variables,
    train_and_export_graphviz_tree,
)
from .config import DEFAULT_BASE_COLOR, DEFAULT_MIN_SAMPLES_LEAF
from .datasets import load_dataset
from .reporting import print_best_splits, print_variable_suggestions
from .tree import TreeModel


def start_manual_tree(df: pd.DataFrame, base_color: str = DEFAULT_BASE_COLOR) -> TreeModel:
    """Create a new manual tree model.

    Parameters
    ----------
    df : pandas.DataFrame
        Source dataset for the manual tree.
    base_color : str, default "#4C78A8"
        Base color used by the default renderer.

    Returns
    -------
    TreeModel
        Newly created manual tree model.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.workflow import start_manual_tree
    >>> df = pd.DataFrame({"x": [1, 2], "y": [0, 1]})
    >>> start_manual_tree(df).df.shape
    (2, 2)
    """
    return TreeModel(df, base_color=base_color)


# Backward-compatible alias for existing notebook code.
ManualTreeSession = TreeModel


def run_decision_tree_demo(
    dataset_path: str | Path,
    target_col: str,
    split_index: int = 1,
    top_n: int = 12,
    min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF,
    exclude_cols: list[str] | None = None,
    png_path: str | Path | None = None,
):
    """Run a simple end-to-end workflow for a CSV classification dataset.

    Parameters
    ----------
    dataset_path : str or pathlib.Path
        Path to the input CSV dataset.
    target_col : str
        Name of the target column.
    split_index : int, default 1
        One-based index of the candidate split to inspect.
    top_n : int, default 12
        Number of split candidates to print.
    min_samples_leaf : int, default 20
        Minimum number of rows allowed in each child branch.
    exclude_cols : list of str, optional
        Columns to exclude from split search and model training.
    png_path : str or pathlib.Path, optional
        Output path for the exported tree image. If omitted, a file named
        ``decision_tree.png`` is created next to the dataset.

    Returns
    -------
    dict
        The selected split candidate.

    Examples
    --------
    >>> from controltree.workflow import run_decision_tree_demo
    >>> result = run_decision_tree_demo("my_dataset.csv", "survived")  # doctest: +SKIP
    """
    exclude_cols = exclude_cols or []
    df = load_dataset(dataset_path)
    print(f"Loaded dataset: {Path(dataset_path)} ({len(df)} rows)")
    print(f"Target column: {target_col}")

    splits = find_best_splits(
        df,
        target_col=target_col,
        top_n=top_n,
        min_samples_leaf=min_samples_leaf,
        exclude_cols=exclude_cols,
    )
    print_best_splits(splits)

    chosen = choose_split(splits, split_index)
    left, right = apply_split(df, chosen)
    print(
        f"\nChosen split: {chosen['feature']} {chosen['operator']} {chosen['value']} "
        f"(gain={chosen['gain']:.5f})"
    )
    print(f"Left rows: {len(left)} | Right rows: {len(right)}")

    output_path = (
        Path(png_path) if png_path is not None else Path(dataset_path).with_name("decision_tree.png")
    )
    train_and_export_graphviz_tree(
        df,
        target_col=target_col,
        png_path=output_path,
        min_samples_leaf=min_samples_leaf,
        exclude_cols_for_training=exclude_cols,
    )
    return chosen


__all__ = [
    "ManualTreeSession",
    "TreeModel",
    "apply_split",
    "choose_split",
    "find_best_splits",
    "load_dataset",
    "print_best_splits",
    "print_variable_suggestions",
    "run_decision_tree_demo",
    "start_manual_tree",
    "suggest_best_split_variables",
    "train_and_export_graphviz_tree",
]
