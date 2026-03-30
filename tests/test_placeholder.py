"""Placeholder tests for the ``controltree`` package."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from controltree import ControlTree, Node


def test_public_api_placeholder() -> None:
    """Verify that the placeholder public API imports cleanly."""
    tree = ControlTree()
    node = Node(name="root")

    assert tree.root is None
    assert node.name == "root"
