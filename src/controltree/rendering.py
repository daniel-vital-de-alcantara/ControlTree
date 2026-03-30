"""Rendering utilities for decision tree visualizations."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import DEFAULT_BASE_COLOR


class TreeRenderer:
    """Render decision tree structures with Graphviz.

    The main workflow is:

    1. initialize the renderer with a root node
    2. add one or more splits from that root or its descendants
    3. show the tree in a notebook or save it to disk

    Parameters
    ----------
    base_color : str, default "#4C78A8"
        Base hex color used when filling rendered box nodes.
    node_shape : str, default "box"
        Default Graphviz node shape for rendered tree boxes.
    node_style : str, default "rounded,filled"
        Default Graphviz style string applied to box nodes.
    node_fillcolor : str, default "white"
        Default Graphviz fill color for nodes that do not override it.
    rankdir : str, default "TB"
        Graphviz rank direction.
    nodesep : str, default "0.45"
        Graphviz horizontal spacing between sibling nodes.
    ranksep : str, default "0.55"
        Graphviz vertical spacing between ranks.
    bgcolor : str, default "white"
        Graph background color.
    root_label : str, default "Root"
        Text shown inside the root node.

    Examples
    --------
    >>> tree = TreeRenderer(root_label="All customers")
    >>> child_ids = tree.add_split(
    ...     tree.root_id,
    ...     "Region",
    ...     ["North", "South"],
    ...     ["North node", "South node"],
    ... )
    >>> len(child_ids)
    2
    """

    def __init__(
        self,
        base_color: str = DEFAULT_BASE_COLOR,
        *,
        node_shape: str = "box",
        node_style: str = "rounded,filled",
        node_fillcolor: str = "white",
        rankdir: str = "TB",
        nodesep: str = "0.45",
        ranksep: str = "0.55",
        bgcolor: str = "white",
        root_label: str = "Root",
    ) -> None:
        self.base_color = base_color
        self.node_shape = node_shape
        self.node_style = node_style
        self.node_fillcolor = node_fillcolor
        self.rankdir = rankdir
        self.nodesep = nodesep
        self.ranksep = ranksep
        self.bgcolor = bgcolor

        self._dot = self._create_graph()
        self.root_id = "root"
        self.box(self.root_id, root_label, color=self.base_color)

    def add_split(
        self,
        to: str,
        split_variable: str,
        cutpoints: list[str],
        child_node_labels: list[str],
    ) -> list[str]:
        """Add a split beneath an existing node.

        Parameters
        ----------
        to : str
            Identifier of the parent node that is being split.
        split_variable : str
            Name of the split variable.
        cutpoints : list of str
            Ordered branch labels shown under the split variable.
        child_node_labels : list of str
            Ordered child-node labels aligned with ``cutpoints``.

        Returns
        -------
        list of str
            Child-node identifiers in branch order.
        """
        self._validate_branch_labels(cutpoints)
        self._validate_length(cutpoints, child_node_labels)
        split_variable_node_id = self._add_split_variable_node(
            to=to,
            split_variable=split_variable,
        )

        n_anchors = (len(cutpoints) // 2) * 2 + 1
        mid_anchor = n_anchors // 2 + 1
        anchor_ids = [f"{split_variable_node_id}__anchor_{i}" for i in range(1, n_anchors + 1)]
        self._set_as_same_height(anchor_ids)

        child_ids: list[str] = []
        for index, anchor_id in enumerate(anchor_ids, start=1):
            self._add_anchor_node(anchor_id)

            if index < mid_anchor:
                self._dot.edge(anchor_id, anchor_ids[index], arrowhead="none")
                branch_index = index
                branch_id = f"{to}__cut_{branch_index}"
                self._add_branch_label(
                    anchor_id=anchor_id,
                    label=cutpoints[branch_index - 1],
                    node_id=branch_id,
                )
                child_id = str(branch_index) if to == "root" else f"{to}_{branch_index}"
                self._dot.edge(branch_id, child_id, arrowhead="none", weight="10")
                self.box(child_id, child_node_labels[branch_index - 1], color=self.base_color)
                child_ids.append(child_id)
                continue

            if index == mid_anchor:
                self._dot.edge(split_variable_node_id, anchor_id, arrowhead="none")
                if len(cutpoints) % 2 == 1:
                    branch_index = index
                    branch_id = f"{to}__cut_{branch_index}"
                    self._add_branch_label(
                        anchor_id=anchor_id,
                        label=cutpoints[branch_index - 1],
                        node_id=branch_id,
                    )
                    child_id = str(branch_index) if to == "root" else f"{to}_{branch_index}"
                    self._dot.edge(branch_id, child_id, arrowhead="none", weight="10")
                    self.box(
                        child_id,
                        child_node_labels[branch_index - 1],
                        color=self.base_color,
                    )
                    child_ids.append(child_id)
                continue

            branch_index = index if len(cutpoints) % 2 == 1 else index - 1
            self._dot.edge(anchor_ids[index - 2], anchor_id, arrowhead="none")
            branch_id = f"{to}__cut_{branch_index}"
            self._add_branch_label(
                anchor_id=anchor_id,
                label=cutpoints[branch_index - 1],
                node_id=branch_id,
            )
            child_id = str(branch_index) if to == "root" else f"{to}_{branch_index}"
            self._dot.edge(branch_id, child_id, arrowhead="none", weight="10")
            self.box(child_id, child_node_labels[branch_index - 1], color=self.base_color)
            child_ids.append(child_id)

        return child_ids

    def show(self, output_path: str | Path | None = None) -> Any:
        """Show the current tree or save it to disk."""
        if output_path is None:
            return self._dot

        output = Path(output_path)
        self._dot.render(filename=output.stem, directory=str(output.parent), cleanup=True)
        print(f"Saved custom tree to: {output}")
        return None

    def box(
        self,
        node_id: str,
        label: str,
        color: str | None = None,
        *,
        shape: str | None = None,
        style: str | None = None,
    ) -> str:
        """Add a node using a caller-provided id."""
        self._dot.node(
            node_id,
            label=label,
            shape=shape or self.node_shape,
            style=style or self.node_style,
            fillcolor=color or self.base_color,
        )
        return node_id

    def _create_graph(self) -> Any:
        """Create a Graphviz graph configured with the renderer defaults."""
        try:
            from graphviz import Digraph
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Missing dependency `graphviz`. Install with `pip install graphviz`."
            ) from exc

        dot = Digraph("tree", format="png")
        dot.attr(
            rankdir=self.rankdir,
            nodesep=self.nodesep,
            ranksep=self.ranksep,
            bgcolor=self.bgcolor,
        )
        dot.attr(
            "node",
            shape=self.node_shape,
            style=self.node_style,
            fillcolor=self.node_fillcolor,
        )
        return dot

    @staticmethod
    def _validate_length(left: list[str], right: list[str]) -> None:
        """Validate that two aligned label lists have the same length."""
        if len(left) != len(right):
            raise ValueError("cutpoints and child_node_labels must have the same length.")

    @staticmethod
    def _validate_branch_labels(branch_labels: list[str]) -> None:
        """Validate that branch labels were provided."""
        if not branch_labels:
            raise ValueError("branch_labels must contain at least one item.")

    def _add_split_variable_node(
        self,
        *,
        to: str,
        split_variable: str,
    ) -> str:
        """Attach a split variable to an existing node."""
        split_variable_node_id = f"{to}__split"
        self._add_plaintext_node(split_variable_node_id, split_variable)
        self._dot.edge(
            to,
            split_variable_node_id,
            arrowhead="none",
            tailport="s",
            headport="n",
        )
        return split_variable_node_id

    def _add_split_variable_and_branch_label_nodes(
        self,
        *,
        to: str,
        split_variable: str,
        branch_labels: list[str],
    ) -> list[str]:
        """Add the split variable node and its branch-label nodes."""
        self._validate_branch_labels(branch_labels)
        split_variable_node_id = self._add_split_variable_node(
            to=to,
            split_variable=split_variable,
        )
        n_anchors = (len(branch_labels) // 2) * 2 + 1
        mid_anchor = n_anchors // 2 + 1
        anchor_ids = [f"{split_variable_node_id}__anchor_{i}" for i in range(1, n_anchors + 1)]
        self._set_as_same_height(anchor_ids)

        branch_ids: list[str] = []
        for index, anchor_id in enumerate(anchor_ids, start=1):
            self._add_anchor_node(anchor_id)

            if index < mid_anchor:
                self._dot.edge(anchor_id, anchor_ids[index], arrowhead="none")
                branch_id = f"{to}__cut_{index}"
                self._add_branch_label(
                    anchor_id=anchor_id,
                    label=branch_labels[index - 1],
                    node_id=branch_id,
                )
                branch_ids.append(branch_id)
                continue

            if index == mid_anchor:
                self._dot.edge(split_variable_node_id, anchor_id, arrowhead="none")
                if len(branch_labels) % 2 == 1:
                    branch_id = f"{to}__cut_{index}"
                    self._add_branch_label(
                        anchor_id=anchor_id,
                        label=branch_labels[index - 1],
                        node_id=branch_id,
                    )
                    branch_ids.append(branch_id)
                continue

            branch_index = index if len(branch_labels) % 2 == 1 else index - 1
            self._dot.edge(anchor_ids[index - 2], anchor_id, arrowhead="none")
            branch_id = f"{to}__cut_{branch_index}"
            self._add_branch_label(
                anchor_id=anchor_id,
                label=branch_labels[branch_index - 1],
                node_id=branch_id,
            )
            branch_ids.append(branch_id)

        return branch_ids

    def _add_branch_label(self, *, anchor_id: str, label: str, node_id: str) -> None:
        """Add one branch label beneath an anchor node."""
        self._add_plaintext_node(node_id, label)
        self._dot.edge(anchor_id, node_id, arrowhead="none", weight="10")

    def _set_as_same_height(self, nodes: list[str]) -> None:
        """Place nodes on the same Graphviz rank."""
        with self._dot.subgraph() as same_height:
            same_height.attr(rank="same")
            for node in nodes:
                same_height.node(node)

    def _add_plaintext_node(self, node_id: str, label: str) -> None:
        """Add a Graphviz plaintext node."""
        self._dot.node(node_id, label=label, shape="plaintext")

    def _add_anchor_node(self, node_id: str) -> None:
        """Add an invisible point node used for split layout."""
        self._dot.node(node_id, "", shape="point", width="0.00")
