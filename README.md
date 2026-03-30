# controltree

`controltree` is a small decision-tree toolkit for tabular classification workflows, with support for manual tree-building and automated training workflows.

## Package layout

- `src/controltree/config.py`: package defaults and runtime configuration.
- `src/controltree/schema.py`: shared schema and type definitions.
- `src/controltree/datasets.py`: dataset loading helpers.
- `src/controltree/evaluation.py`: reusable metrics and model evaluation helpers.
- `src/controltree/reporting.py`: reporting and console-formatting helpers.
- `src/controltree/builders.py`: tree-building and training helpers.
- `src/controltree/rendering.py`: tree rendering and visualization support.
- `src/controltree/workflow.py`: higher-level orchestration utilities.

## Installation

```bash
pip install .
```

For local development:

```bash
pip install -e .[dev]
```

## Example Data

The package exposes a `load_titanic()` helper backed by `seaborn.load_dataset("titanic")` for local experimentation and demos.

## Documentation

The repository is set up for Sphinx-based documentation, and the root `README.md` is the canonical package overview.
