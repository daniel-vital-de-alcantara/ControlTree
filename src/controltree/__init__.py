"""Decision tree utilities and workflows for magicroot."""

from .builders import (
    apply_split,
    choose_split,
    find_best_splits,
    suggest_best_split_variables,
    train_and_export_graphviz_tree,
)
from .datasets import load_dataset, load_example_dataset, load_titanic
from .rendering import TreeRenderer
from .reporting import print_best_splits, print_variable_suggestions
from .tree import TreeModel
from .workflow import (
    ManualTreeSession,
    run_decision_tree_demo,
    start_manual_tree,
)

__all__ = [
    "ManualTreeSession",
    "TreeModel",
    "TreeRenderer",
    "apply_split",
    "choose_split",
    "find_best_splits",
    "load_dataset",
    "load_example_dataset",
    "load_titanic",
    "print_best_splits",
    "print_variable_suggestions",
    "run_decision_tree_demo",
    "suggest_best_split_variables",
    "start_manual_tree",
    "train_and_export_graphviz_tree",
]
