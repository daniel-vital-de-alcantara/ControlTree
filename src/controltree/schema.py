"""Shared data structures used across the decision tree package."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pandas as pd


SplitCandidate = dict[str, Any]
VariableSuggestion = dict[str, Any]


@dataclass
class ManualTreeNode:
    """A single node in a manually constructed decision tree.

    Parameters
    ----------
    node_id : str
        Unique node identifier within the tree.
    row_index : pandas.Index
        Index values of the rows assigned to the node.
    depth : int
        Zero-based depth of the node.
    parent_id : str, optional
        Parent node identifier.
    branch_label : str, optional
        Label displayed on the branch leading into the node.
    split : dict, optional
        Split metadata applied at the node.
    left_id : str, optional
        Identifier of the left child for binary splits.
    right_id : str, optional
        Identifier of the right child for binary splits.
    child_ids : list of str, optional
        Ordered child identifiers.
    metadata : dict, optional
        Free-form metadata attached to the node.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.schema import ManualTreeNode
    >>> node = ManualTreeNode(node_id="1", row_index=pd.Index([0, 1]), depth=1)
    >>> node.node_id
    '1'
    """

    node_id: str
    row_index: pd.Index
    depth: int
    parent_id: str | None = None
    branch_label: str | None = None
    split: SplitCandidate | None = None
    left_id: str | None = None
    right_id: str | None = None
    child_ids: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
