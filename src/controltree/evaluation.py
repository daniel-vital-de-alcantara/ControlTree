"""Evaluation helpers used by split search and model training."""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from sklearn.metrics import accuracy_score, classification_report


def gini_impurity(y: pd.Series) -> float:
    """Compute the Gini impurity of a target series.

    Parameters
    ----------
    y : pandas.Series
        Target values for a candidate node.

    Returns
    -------
    float
        Gini impurity for ``y``.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.evaluation import gini_impurity
    >>> round(gini_impurity(pd.Series([0, 0, 1, 1])), 2)
    0.5
    """
    if y.empty:
        return 0.0
    probs = y.value_counts(normalize=True).to_numpy()
    return 1.0 - float(np.sum(probs**2))


def summarize_classifier_predictions(y_true: pd.Series, y_pred: Any) -> dict[str, Any]:
    """Return basic classifier diagnostics used by the package.

    Parameters
    ----------
    y_true : pandas.Series
        Observed target values.
    y_pred : array-like
        Predicted target values.

    Returns
    -------
    dict
        Dictionary containing ``accuracy`` and ``classification_report``.

    Examples
    --------
    >>> import pandas as pd
    >>> from magicroot.decision_trees.evaluation import summarize_classifier_predictions
    >>> result = summarize_classifier_predictions(pd.Series([0, 1]), [0, 1])
    >>> round(result["accuracy"], 2)
    1.0
    """
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "classification_report": classification_report(y_true, y_pred, digits=4),
    }
