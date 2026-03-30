"""Tree state and manual split management for decision tree workflows."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .builders import (
    apply_split,
    choose_split,
    find_best_splits,
    suggest_best_split_variables,
)
from .config import (
    DEFAULT_BASE_COLOR,
    DEFAULT_MAX_NUMERIC_THRESHOLDS,
    DEFAULT_MIN_SAMPLES_LEAF,
    DEFAULT_TOP_N_SPLITS,
)
from .rendering import TreeRenderer
from .reporting import print_best_splits, print_variable_suggestions
from .schema import ManualTreeNode, SplitCandidate, VariableSuggestion


class TreeModel:
    """Stateful manual decision-tree model with split-by-split control.

    This class owns tree structure, split application, node membership, and
    validation. Rendering is delegated to :class:`TreeRenderer`.

    Parameters
    ----------
    df : pandas.DataFrame
        Source dataset used to build the manual tree. Row membership for each
        node is tracked against this DataFrame's index.
    base_color : str, default "#4C78A8"
        Base hex color used by the renderer when shading nodes.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.tree import TreeModel
    >>> df = pd.DataFrame({"x": [1, 2, 3], "y": [0, 0, 1]})
    >>> model = TreeModel(df).set_target("y")
    >>> isinstance(model.nodes, dict)
    True
    """

    def __init__(self, df: pd.DataFrame, base_color: str = DEFAULT_BASE_COLOR) -> None:
        self.df = df.copy()
        self.target_col: str | None = None
        self.exclude_cols: list[str] = []
        self.min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF
        self.base_color = base_color
        self.renderer = TreeRenderer(base_color=base_color)
        self.nodes: dict[str, ManualTreeNode] = {
            "": ManualTreeNode(node_id="", row_index=self.df.index, depth=0)
        }

    def set_target(
        self,
        target_col: str,
        *,
        exclude_cols: list[str] | None = None,
        min_samples_leaf: int = DEFAULT_MIN_SAMPLES_LEAF,
    ) -> "TreeModel":
        """Define the target variable and optional excluded columns.

        Parameters
        ----------
        target_col : str
            Name of the target column in ``df``.
        exclude_cols : list of str, optional
            Feature columns to ignore when generating split suggestions.
        min_samples_leaf : int, default 20
            Minimum number of rows allowed in each child node.

        Returns
        -------
        TreeModel
            The same instance, returned for method chaining.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"feature": [1, 2], "target": [0, 1]})
        >>> model = TreeModel(df).set_target("target", exclude_cols=["feature"])
        >>> model.target_col
        'target'
        """
        if target_col not in self.df.columns:
            raise ValueError(f"Target column '{target_col}' not found.")
        self.target_col = target_col
        self.exclude_cols = list(exclude_cols or [])
        self.min_samples_leaf = min_samples_leaf
        return self

    def suggest_splits(
        self,
        node_id: str = "root",
        *,
        top_n: int = DEFAULT_TOP_N_SPLITS,
        max_numeric_thresholds: int = DEFAULT_MAX_NUMERIC_THRESHOLDS,
        only_feature: str | None = None,
    ) -> list[SplitCandidate]:
        """Return the best split candidates for a node.

        Parameters
        ----------
        node_id : str, default "root"
            Identifier of the node to evaluate. The string ``"root"`` refers to
            the root node.
        top_n : int, default 10
            Maximum number of candidate splits to return.
        max_numeric_thresholds : int, default 20
            Number of quantile-based thresholds to test for numeric features.
        only_feature : str, optional
            If provided, evaluate only this feature.

        Returns
        -------
        list of dict
            Ranked split candidates sorted by descending gain.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> isinstance(model.suggest_splits(top_n=1), list)
        True
        """
        self._require_target()
        node = self._get_node(node_id)
        return find_best_splits(
            self.df.loc[node.row_index],
            target_col=self.target_col or "",
            top_n=top_n,
            min_samples_leaf=self.min_samples_leaf,
            max_numeric_thresholds=max_numeric_thresholds,
            exclude_cols=self.exclude_cols,
            only_feature=only_feature,
        )

    def suggest_cutpoints(
        self,
        node_id: str,
        feature: str,
        *,
        top_n: int = 6,
        max_numeric_thresholds: int = 30,
    ) -> list[SplitCandidate]:
        """Convenience wrapper for numeric cutpoint suggestions.

        Parameters
        ----------
        node_id : str
            Identifier of the node to evaluate.
        feature : str
            Numeric feature name for which candidate cutpoints should be ranked.
        top_n : int, default 6
            Maximum number of candidate cutpoints to return.
        max_numeric_thresholds : int, default 30
            Number of quantile-based thresholds to test.

        Returns
        -------
        list of dict
            Ranked split candidates for the requested feature.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> isinstance(model.suggest_cutpoints("root", "x"), list)
        True
        """
        return self.suggest_splits(
            node_id,
            top_n=top_n,
            max_numeric_thresholds=max_numeric_thresholds,
            only_feature=feature,
        )

    def suggest_variables(
        self,
        node_id: str = "root",
        *,
        top_n: int = DEFAULT_TOP_N_SPLITS,
        max_numeric_thresholds: int = DEFAULT_MAX_NUMERIC_THRESHOLDS,
    ) -> list[VariableSuggestion]:
        """Rank candidate split variables for a node.

        Parameters
        ----------
        node_id : str, default "root"
            Identifier of the node to evaluate.
        top_n : int, default 10
            Maximum number of ranked variables to return.
        max_numeric_thresholds : int, default 20
            Number of quantile-based thresholds to test for numeric features.

        Returns
        -------
        list of dict
            Variable summaries sorted by descending best available gain.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "z": [1, 1, 2, 2], "y": [0, 0, 1, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> isinstance(model.suggest_variables(top_n=2), list)
        True
        """
        self._require_target()
        node = self._get_node(node_id)
        return suggest_best_split_variables(
            self.df.loc[node.row_index],
            target_col=self.target_col or "",
            top_n=top_n,
            min_samples_leaf=self.min_samples_leaf,
            max_numeric_thresholds=max_numeric_thresholds,
            exclude_cols=self.exclude_cols,
        )

    def confirm_split(
        self,
        node_id: str,
        *,
        selected_split: SplitCandidate | None = None,
        suggestions: list[SplitCandidate] | None = None,
        choice_index: int | None = None,
        overwrite: bool = True,
    ) -> tuple[str, str]:
        """Apply a binary split candidate to the selected node.

        Parameters
        ----------
        node_id : str
            Identifier of the node to split.
        selected_split : dict, optional
            Split candidate to apply directly.
        suggestions : list of dict, optional
            Candidate list from :meth:`suggest_splits`.
        choice_index : int, optional
            One-based index selecting an entry from ``suggestions``.
        overwrite : bool, default True
            Whether to remove existing descendants before applying the new split.

        Returns
        -------
        tuple of str
            The left and right child node identifiers.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2, 3, 4], "y": [0, 0, 1, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> suggestions = model.suggest_splits(top_n=1)
        >>> isinstance(model.confirm_split("root", suggestions=suggestions, choice_index=1), tuple)
        True
        """
        self._require_target()
        node = self._get_node(node_id)
        if node.left_id or node.right_id:
            if not overwrite:
                raise ValueError(f"Node '{node_id}' already has children.")
            self._clear_children(node_id)

        split = selected_split
        if split is None:
            if suggestions is None or choice_index is None:
                raise ValueError(
                    "Provide either `selected_split` or (`suggestions` + `choice_index`)."
                )
            split = choose_split(suggestions, choice_index)

        left_df, right_df = apply_split(self.df.loc[node.row_index], split)
        if left_df.empty or right_df.empty:
            raise ValueError("Chosen split creates an empty branch; choose a different split.")

        parent_norm = self._normalize_node_id(node_id)
        left_id = self._child_node_id(parent_norm, 1)
        right_id = self._child_node_id(parent_norm, 2)
        self.nodes[left_id] = ManualTreeNode(
            node_id=left_id,
            row_index=left_df.index,
            depth=node.depth + 1,
            parent_id=parent_norm,
            branch_label="True",
        )
        self.nodes[right_id] = ManualTreeNode(
            node_id=right_id,
            row_index=right_df.index,
            depth=node.depth + 1,
            parent_id=parent_norm,
            branch_label="False",
        )
        node.split = split
        node.left_id = left_id
        node.right_id = right_id
        node.child_ids = [left_id, right_id]
        return left_id, right_id

    def confirm_manual_split(
        self,
        node_id: str,
        *,
        feature: str,
        categories: list[Any] | None = None,
        cut_points: list[float] | None = None,
        force_categorical: bool = False,
        other_label: str = "other",
        other_position: int | None = None,
        include_other: bool = True,
        overwrite: bool = True,
    ) -> list[str]:
        """Apply a manual split while preserving the caller-defined branch order.

        Parameters
        ----------
        node_id : str
            Identifier of the node to split.
        feature : str
            Feature used to define the manual split.
        categories : list, optional
            Ordered categories for a categorical split or cutpoints for a numeric
            split.
        cut_points : list of float, optional
            Legacy alias for numeric cutpoints.
        force_categorical : bool, default False
            If True, treat ``feature`` as categorical even when it is numeric.
        other_label : str, default "other"
            Label assigned to the residual branch when ``include_other`` is True.
        other_position : int, optional
            One-based insertion position for the residual branch.
        include_other : bool, default True
            Whether to include a residual branch for unmatched or missing values.
        overwrite : bool, default True
            Whether to remove existing descendants before applying the split.

        Returns
        -------
        list of str
            Child node identifiers in the exact branch order used for rendering.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"who": ["man", "woman", "child"], "y": [0, 1, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> isinstance(model.confirm_manual_split("root", feature="who", categories=["man"]), list)
        True
        """
        self._require_target()
        node = self._get_node(node_id)
        if node.child_ids:
            if not overwrite:
                raise ValueError(f"Node '{node_id}' already has children.")
            self._clear_children(node_id)

        df_node = self.df.loc[node.row_index]
        if feature not in df_node.columns:
            raise ValueError(f"Feature '{feature}' not found.")

        series = df_node[feature]
        children: list[str] = []
        parent_norm = self._normalize_node_id(node_id)
        split_values = categories if categories is not None else cut_points
        if split_values is None:
            raise ValueError("Provide `categories=[...]` (or legacy `cut_points=[...]`).")

        if pd.api.types.is_numeric_dtype(series) and not force_categorical:
            cutpoints = _normalize_numeric_cutpoints(split_values)
            branch_defs = _numeric_branch_definitions(
                df_node=df_node,
                series=series,
                cutpoints=cutpoints,
                include_other=include_other,
                other_label=other_label,
            )
            split_meta: SplitCandidate = {
                "feature": feature,
                "kind": "manual_numeric",
                "cut_points": cutpoints,
            }
        else:
            branch_defs = _categorical_branch_definitions(
                df_node=df_node,
                series=series,
                categories=list(split_values),
                include_other=include_other,
                other_label=other_label,
                other_position=other_position,
            )
            split_meta = {
                "feature": feature,
                "kind": "manual_categorical",
                "categories": list(split_values),
            }

        for ordinal, (branch_label, mask) in enumerate(branch_defs, start=1):
            part = df_node.loc[mask]
            if part.empty:
                continue
            child_id = self._child_node_id(parent_norm, ordinal)
            self.nodes[child_id] = ManualTreeNode(
                node_id=child_id,
                row_index=part.index,
                depth=node.depth + 1,
                parent_id=parent_norm,
                branch_label=branch_label,
            )
            children.append(child_id)

        if len(children) < 2:
            raise ValueError(
                "Manual split produced fewer than 2 non-empty branches. "
                "Choose different cutpoints/categories."
            )

        node.split = split_meta
        node.child_ids = children
        node.left_id = children[0]
        node.right_id = children[1] if len(children) > 1 else None
        return children

    def print_suggestions(self, suggestions: list[SplitCandidate]) -> None:
        """Print split suggestions with stable formatting.

        Parameters
        ----------
        suggestions : list of dict
            Split candidates to print.

        Returns
        -------
        None

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2], "y": [0, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> model.print_suggestions(model.suggest_splits(top_n=1))
        """
        print_best_splits(suggestions)

    def print_variable_suggestions(self, variable_suggestions: list[VariableSuggestion]) -> None:
        """Print variable-ranking suggestions with stable formatting.

        Parameters
        ----------
        variable_suggestions : list of dict
            Ranked variable summaries to print.

        Returns
        -------
        None

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2], "y": [0, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> model.print_variable_suggestions(model.suggest_variables(top_n=1))
        """
        print_variable_suggestions(variable_suggestions)

    def draw_tree(
        self, png_path: str | Path | None = None, base_color: str | None = None
    ) -> Any:
        """Render the current manual tree to a notebook or PNG using the configured renderer.

        Parameters
        ----------
        png_path : str or pathlib.Path, optional
            Output path for the rendered PNG. If omitted, return the Graphviz
            object for inline notebook display.
        base_color : str, optional
            Optional override for the renderer base color.

        Returns
        -------
        graphviz.Digraph or None
            Graphviz object when ``png_path`` is omitted, otherwise ``None``.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2], "y": [0, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> model.draw_tree()  # doctest: +SKIP
        """
        return self._render_tree(png_path=png_path, base_color=base_color)

    def show_tree(self, base_color: str | None = None) -> Any:
        """Return the Graphviz object for inline notebook display.

        Parameters
        ----------
        base_color : str, optional
            Optional override for the renderer base color.

        Returns
        -------
        graphviz.Digraph
            Graphviz object representing the current manual tree.

        Examples
        --------
        >>> import pandas as pd
        >>> from magicroot.decision_trees.tree import TreeModel
        >>> df = pd.DataFrame({"x": [1, 2], "y": [0, 1]})
        >>> model = TreeModel(df).set_target("y", min_samples_leaf=1)
        >>> tree = model.show_tree()  # doctest: +SKIP
        """
        return self._render_tree(base_color=base_color)

    def _render_tree(
        self,
        png_path: str | Path | None = None,
        *,
        base_color: str | None = None,
    ) -> Any:
        """Render the current tree using ``TreeRenderer`` primitives."""
        self._require_target()
        renderer = self._build_renderer(base_color=base_color)
        self._populate_renderer(renderer, base_color=base_color or self.base_color)
        return renderer.show(png_path)

    def _build_renderer(self, *, base_color: str | None = None) -> TreeRenderer:
        """Create a renderer that mirrors the current renderer configuration."""
        return TreeRenderer(
            base_color=base_color or self.renderer.base_color,
            node_shape=self.renderer.node_shape,
            node_style=self.renderer.node_style,
            node_fillcolor=self.renderer.node_fillcolor,
            rankdir=self.renderer.rankdir,
            nodesep=self.renderer.nodesep,
            ranksep=self.renderer.ranksep,
            bgcolor=self.renderer.bgcolor,
        )

    def _populate_renderer(self, renderer: TreeRenderer, *, base_color: str) -> None:
        """Populate ``renderer`` with the current tree structure."""
        node_avgs, root_avg, vmin, vmax = self._compute_render_state()
        self._add_rendered_nodes(
            renderer,
            node_avgs=node_avgs,
            root_avg=root_avg,
            vmin=vmin,
            vmax=vmax,
            base_color=base_color,
        )
        self._add_rendered_edges(renderer)

    def _add_rendered_nodes(
        self,
        renderer: TreeRenderer,
        *,
        node_avgs: dict[str, float],
        root_avg: float,
        vmin: float,
        vmax: float,
        base_color: str,
    ) -> None:
        """Add all rendered node boxes to ``renderer``."""
        for node_id, node in self.nodes.items():
            self._add_rendered_node(
                renderer,
                node_id=node_id,
                node=node,
                node_avgs=node_avgs,
                root_avg=root_avg,
                vmin=vmin,
                vmax=vmax,
                base_color=base_color,
            )

    def _add_rendered_node(
        self,
        renderer: TreeRenderer,
        *,
        node_id: str,
        node: ManualTreeNode,
        node_avgs: dict[str, float],
        root_avg: float,
        vmin: float,
        vmax: float,
        base_color: str,
    ) -> None:
        """Add one rendered node box to ``renderer``."""
        renderer.box(
            self._graph_node_id(node_id),
            self._node_label(node),
            color=self._color_from_value(
                node_avgs.get(node_id, root_avg),
                vmin=vmin,
                vmax=vmax,
                base_color=base_color,
            ),
        )

    def _add_rendered_edges(self, renderer: TreeRenderer) -> None:
        """Add all rendered edges and split structures to ``renderer``."""
        for node_id, node in self.nodes.items():
            self._add_rendered_node_connections(renderer, node_id=node_id, node=node)

    def _add_rendered_node_connections(
        self,
        renderer: TreeRenderer,
        *,
        node_id: str,
        node: ManualTreeNode,
    ) -> None:
        """Add the rendered connections associated with one node."""
        if self._uses_direct_parent_edge(node):
            renderer._dot.edge(
                self._graph_node_id(node.parent_id or ""),
                self._graph_node_id(node.node_id),
                xlabel=node.branch_label or "",
                arrowhead="none",
                weight="10",
            )

        if node.split and node.child_ids:
            self._add_rendered_split_structure(renderer, node_id=node_id, node=node)

    def _uses_direct_parent_edge(self, node: ManualTreeNode) -> bool:
        """Return whether ``node`` should connect directly to its parent box."""
        if not node.parent_id:
            return False

        parent = self.nodes[node.parent_id]
        return not (parent.split and parent.child_ids)

    def _add_rendered_split_structure(
        self,
        renderer: TreeRenderer,
        *,
        node_id: str,
        node: ManualTreeNode,
    ) -> None:
        """Add the rendered split structure beneath one node."""
        parent_node_id = self._graph_node_id(node_id)
        branch_ids = renderer._add_split_variable_and_branch_label_nodes(
            to=parent_node_id,
            split_variable=self._split_name(node),
            branch_labels=self._child_branch_labels(node.child_ids),
        )

        for child_id, branch_id in zip(node.child_ids, branch_ids):
            renderer._dot.edge(
                branch_id,
                self._graph_node_id(child_id),
                arrowhead="none",
                weight="10",
            )

    @staticmethod
    def _split_name(node: ManualTreeNode) -> str:
        """Return the display name for a node split."""
        return str((node.split or {}).get("feature", "split"))

    def _child_branch_labels(self, child_ids: list[str]) -> list[str]:
        """Return ordered branch labels for rendered child edges."""
        return [self.nodes[child_id].branch_label or "" for child_id in child_ids]

    def _compute_render_state(self) -> tuple[dict[str, float], float, float, float]:
        """Compute per-node summary values used during rendering."""
        target = self.target_col or ""
        root_series = self._target_series(self.df.index, target)
        root_avg = float(root_series.mean())
        node_avgs: dict[str, float] = {}

        for node_id, node in self.nodes.items():
            node_series = self._target_series(node.row_index, target)
            node_avgs[node_id] = self._series_mean_or_default(node_series, default=root_avg)

        vmin, vmax = self._value_range(node_avgs.values())
        return node_avgs, root_avg, vmin, vmax

    def _node_label(self, node: ManualTreeNode) -> str:
        """Build the multi-line label shown inside one rendered node."""
        target = self.target_col or ""
        target_values = self._target_series(node.row_index, target)
        total_n = len(self.df)
        pct = (100.0 * len(target_values) / total_n) if total_n else 0.0
        avg, std = self._series_summary(target_values)

        lines = self._node_label_lines(
            node=node,
            target=target,
            sample_count=len(target_values),
            pct=pct,
            avg=avg,
            std=std,
        )
        return "\n".join(lines)

    @staticmethod
    def _node_label_lines(
        *,
        node: ManualTreeNode,
        target: str,
        sample_count: int,
        pct: float,
        avg: float,
        std: float,
    ) -> list[str]:
        """Return the label lines for one rendered node."""
        avg_str = f"{avg:.4f}" if not np.isnan(avg) else "NA"
        std_str = f"{std:.4f}" if not np.isnan(std) else "NA"

        lines: list[str] = []
        if node.node_id == "":
            lines.append(target)
        lines.append(f"Sample    {sample_count}    {pct:.1f}%")
        lines.append(f"avg/std    {avg_str}    {std_str}")
        return lines

    def _target_series(self, row_index: Any, target: str) -> pd.Series:
        """Return the numeric target values for a node or index selection."""
        return pd.to_numeric(self.df.loc[row_index, target], errors="coerce")

    @staticmethod
    def _series_summary(values: pd.Series) -> tuple[float, float]:
        """Return the mean and standard deviation for ``values``."""
        if values.empty:
            return float("nan"), float("nan")
        return float(values.mean()), float(values.std())

    @staticmethod
    def _series_mean_or_default(values: pd.Series, *, default: float) -> float:
        """Return the mean of ``values`` or ``default`` when it is empty."""
        if values.empty:
            return default
        return float(values.mean())

    @staticmethod
    def _value_range(values: Any) -> tuple[float, float]:
        """Return finite min/max bounds for a rendered color scale."""
        finite_values = [value for value in values if not np.isnan(value)]
        if not finite_values:
            return 0.0, 1.0
        return min(finite_values), max(finite_values)

    def _color_from_value(self, value: float, *, vmin: float, vmax: float, base_color: str) -> str:
        """Map a numeric value onto the tree color scale."""
        r, g, b = self._hex_to_rgb(base_color)
        t = self._normalized_scale_value(value, vmin=vmin, vmax=vmax)
        mix = 0.18 + 0.82 * t
        rr = int(round(255 - mix * (255 - r)))
        gg = int(round(255 - mix * (255 - g)))
        bb = int(round(255 - mix * (255 - b)))
        return f"#{rr:02X}{gg:02X}{bb:02X}"

    @staticmethod
    def _normalized_scale_value(value: float, *, vmin: float, vmax: float) -> float:
        """Normalize ``value`` to the inclusive ``[0, 1]`` interval."""
        if np.isnan(value) or vmax <= vmin:
            return 0.5
        return max(0.0, min(1.0, (value - vmin) / (vmax - vmin)))

    @staticmethod
    def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
        """Convert a six-character hex color into RGB integers."""
        color = hex_color.strip().lstrip("#")
        if len(color) != 6:
            raise ValueError("base_color must be a hex color like '#4C78A8'.")
        return int(color[0:2], 16), int(color[2:4], 16), int(color[4:6], 16)

    def _child_node_id(self, parent_id: str, ordinal: int) -> str:
        return str(ordinal) if parent_id == "" else f"{parent_id}_{ordinal}"

    def _collect_descendants(self, node_id: str) -> list[str]:
        node = self._get_node(node_id)
        to_delete: list[str] = []
        stack = list(node.child_ids)
        while stack:
            child_id = stack.pop()
            to_delete.append(child_id)
            stack.extend(self.nodes[child_id].child_ids)
        return to_delete

    def _clear_children(self, node_id: str) -> None:
        node = self._get_node(node_id)
        for child_id in self._collect_descendants(node_id):
            self.nodes.pop(child_id, None)
        node.left_id = None
        node.right_id = None
        node.child_ids = []
        node.split = None

    def _require_target(self) -> None:
        if self.target_col is None:
            raise ValueError("Target not set. Call `set_target(...)` first.")

    def _get_node(self, node_id: str) -> ManualTreeNode:
        normalized = self._normalize_node_id(node_id)
        if normalized not in self.nodes:
            raise KeyError(f"Unknown node_id '{node_id}'.")
        return self.nodes[normalized]

    @staticmethod
    def _normalize_node_id(node_id: str) -> str:
        return "" if node_id == "root" else node_id

    @staticmethod
    def _graph_node_id(node_id: str) -> str:
        return "root" if node_id == "" else node_id


def _normalize_numeric_cutpoints(split_values: list[Any]) -> list[float]:
    """Normalize numeric cutpoints into a sorted unique list."""
    cutpoints = sorted(float(value) for value in split_values)
    cutpoints = [value for i, value in enumerate(cutpoints) if i == 0 or value != cutpoints[i - 1]]
    if not cutpoints:
        raise ValueError("`categories` must contain at least one numeric cutpoint.")
    return cutpoints


def _numeric_branch_definitions(
    *,
    df_node: pd.DataFrame,
    series: pd.Series,
    cutpoints: list[float],
    include_other: bool,
    other_label: str,
) -> list[tuple[str, pd.Series]]:
    """Build ordered branch masks for a manual numeric split."""
    branch_defs: list[tuple[str, pd.Series]] = []
    prev = None
    for cutpoint in cutpoints:
        if prev is None:
            mask = series <= cutpoint
            label = f"<={cutpoint:g}"
        else:
            mask = (series > prev) & (series <= cutpoint)
            label = f"({prev:g}, {cutpoint:g}]"
        branch_defs.append((label, mask))
        prev = cutpoint

    branch_defs.append((f">{cutpoints[-1]:g}", series > cutpoints[-1]))
    if include_other:
        missing = df_node.loc[series.isna()]
        if not missing.empty:
            branch_defs.append((other_label, series.isna()))
    return branch_defs


def _categorical_branch_definitions(
    *,
    df_node: pd.DataFrame,
    series: pd.Series,
    categories: list[Any],
    include_other: bool,
    other_label: str,
    other_position: int | None,
) -> list[tuple[str, pd.Series]]:
    """Build ordered branch masks for a manual categorical split."""
    if not categories:
        raise ValueError("For categorical split, provide at least one category.")

    branch_defs: list[tuple[str, pd.Series]] = []
    for category in categories:
        mask = series == category
        if not df_node.loc[mask].empty:
            branch_defs.append((f"{category}", mask))

    if include_other:
        other_mask = (~series.isin(categories)) | (series.isna())
        if int(other_mask.sum()) > 0:
            insert_at = max(1, int(other_position or (len(branch_defs) + 1)))
            insert_at = min(insert_at, len(branch_defs) + 1)
            branch_defs.insert(insert_at - 1, (other_label, other_mask))
    return branch_defs
