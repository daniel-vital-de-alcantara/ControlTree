"""Dataset loading helpers for tabular decision-tree workflows."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


def load_dataset(csv_path: str | Path) -> pd.DataFrame:
    """Load a CSV dataset from disk.

    Parameters
    ----------
    csv_path : str or pathlib.Path
        Path to the input CSV file.

    Returns
    -------
    pandas.DataFrame
        Loaded dataset.

    Examples
    --------
    >>> from controltree.datasets import load_dataset
    >>> df = load_dataset("tests/decision_trees/titanic.csv")  # doctest: +SKIP
    """
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"Could not find dataset: {path}")
    return pd.read_csv(path)


def load_titanic() -> pd.DataFrame:
    """Load the Titanic dataset via ``seaborn``.

    This avoids packaging a local CSV copy while still providing a convenient
    built-in sample dataset for examples and demos.

    Examples
    --------
    >>> from controltree.datasets import load_titanic
    >>> df = load_titanic()  # doctest: +SKIP
    """
    import seaborn as sns

    return sns.load_dataset("titanic")


def load_example_dataset(name: str = "titanic") -> pd.DataFrame:
    """Load a supported example dataset.

    Parameters
    ----------
    name : str, default "titanic"
        Example dataset name.

    Returns
    -------
    pandas.DataFrame
        Loaded example dataset.

    Examples
    --------
    >>> from controltree.datasets import load_example_dataset
    >>> df = load_example_dataset()  # doctest: +SKIP
    """
    normalized = name.strip().lower()
    if normalized != "titanic":
        raise ValueError(
            f"Unknown example dataset '{name}'. Available datasets: ['titanic']"
        )
    return load_titanic()
