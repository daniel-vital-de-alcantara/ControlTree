"""Console reporting helpers for decision tree workflows."""

from __future__ import annotations

from .schema import SplitCandidate, VariableSuggestion


def print_best_splits(splits: list[SplitCandidate]) -> None:
    """Pretty-print split candidates.

    Parameters
    ----------
    splits : list of dict
        Split candidates to print.

    Returns
    -------
    None

    Examples
    --------
    >>> from magicroot.decision_trees.reporting import print_best_splits
    >>> print_best_splits([{"feature": "x", "operator": "<=", "value": 1, "gain": 0.1, "left_n": 2, "right_n": 3, "cutpoint": 1}])
    """
    if not splits:
        print("No candidate splits found with current constraints.")
        return
    print("Best split candidates:")
    for i, split in enumerate(splits, start=1):
        cutpoint = split.get("cutpoint", split.get("value"))
        print(
            f"{i:>2}. feature={split['feature']} | cutpoint={cutpoint} | "
            f"rule: {split['feature']} {split['operator']} {split['value']}  "
            f"(gain={split['gain']:.5f}, left={split['left_n']}, right={split['right_n']})"
        )


def print_variable_suggestions(variable_suggestions: list[VariableSuggestion]) -> None:
    """Pretty-print variable ranking suggestions.

    Parameters
    ----------
    variable_suggestions : list of dict
        Ranked variable summaries to print.

    Returns
    -------
    None

    Examples
    --------
    >>> from magicroot.decision_trees.reporting import print_variable_suggestions
    >>> print_variable_suggestions([{"feature": "x", "best_gain": 0.1, "best_cutpoint": 1, "candidate_count": 3}])
    """
    if not variable_suggestions:
        print("No variable suggestions found.")
        return
    print("Suggested variables (ranked by best gain):")
    for i, row in enumerate(variable_suggestions, start=1):
        print(
            f"{i:>2}. feature={row['feature']} | best_gain={row['best_gain']:.5f} | "
            f"best_cutpoint={row['best_cutpoint']} | candidates={row['candidate_count']}"
        )
