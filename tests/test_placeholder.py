"""Smoke tests for the ``controltree`` public API."""

import pandas as pd

from controltree import TreeModel, start_manual_tree


def test_public_api_starts_a_manual_tree() -> None:
    """Verify that the documented public workflow imports and initializes."""
    frame = pd.DataFrame({"feature": [1, 2], "target": [0, 1]})
    tree = start_manual_tree(frame).set_target("target", min_samples_leaf=1)

    assert isinstance(tree, TreeModel)
    assert tree.target_col == "target"
    assert len(tree.nodes[""].row_index) == 2
