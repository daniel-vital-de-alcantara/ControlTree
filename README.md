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

## Browser workbench prototype

The `web/` directory contains a React workbench for choosing a CSV or Excel
dataset and building a tree without requiring a target. Manual splits,
distributions, metrics, presentation, and saved-tree replay work independently.
When recommended splits are needed, an optional recommendation target is chosen
inside the Node inspector. Categorical targets are ranked by Gini gain and
continuous targets by variance reduction. Split scoring, manual branching, and
saved-tree replay all run in the browser: uploaded rows never leave the user's
device. The Titanic demo remains available without an upload.

The Node inspector supports recommended binary splits, manual numeric or
categorical multiway splits, and a selected-node Distribution tab. That tab
shows descriptive statistics plus configurable numeric histograms or
categorical frequency bars. The Tree configurator controls node, accent,
connector, and canvas colors and can show or hide the dotted grid. Its Metrics
section controls the standard node fields and supports unlimited calculated
metrics. Every metric can independently receive highlighted treatment in the
node cards.
The presentation button opens a second, synchronized tree-only window for live
client sessions. It receives the tree and calculated display values, not raw
dataset rows. A tree can also be downloaded as a versioned, data-free
`.controltree.json` file. After choosing a compatible newer dataset on the
opening screen, that file can replay the split rules, colors, and summary
settings while recalculating every node from the new rows.

The selected-node Distribution tab provides numeric statistics and histograms
or categorical frequency bars. Histogram widths can be set explicitly, and the
chosen variable, width, and scale remain stable while moving between nodes. An
opt-in presentation control adds the current node's calculated distribution
below the synchronized tree without sending source rows to the presentation
window.

```bash
cd web
npm install
npm run dev
```

Run its domain tests with `npm test`, or make a production bundle with
`npm run build`. The FastAPI module remains in the Python package as a reference
implementation and parity-test surface, but it is not required by the hosted
workbench.

## Windows desktop preview

Tagged releases are built on GitHub's Windows runners and published under
GitHub Releases as both a conventional installer and a portable executable.
Both packages contain the React interface and private browser calculation
engine, so end users do not need Node.js or Python and dataset rows remain on
their computer. The Python engine remains available for future desktop-only
advanced analysis.
