# ControlTree

**ControlTree** is an interactive decision-tree workbench for exploratory tabular analysis, manual segmentation, automated split recommendations, and client-ready tree visualization.

**[Open the live browser workbench](https://daniel-vital-de-alcantara.github.io/ControlTree/)** · [Releases](https://github.com/daniel-vital-de-alcantara/ControlTree/releases)

The browser workbench runs its current data processing locally in the browser, so uploaded dataset rows do not leave the user's computer.

## Package layout

- `src/controltree/config.py`: package defaults and runtime configuration.
- `src/controltree/schema.py`: shared schema and type definitions.
- `src/controltree/datasets.py`: dataset loading helpers.
- `src/controltree/evaluation.py`: reusable metrics and model evaluation helpers.
- `src/controltree/reporting.py`: reporting and console-formatting helpers.
- `src/controltree/builders.py`: tree-building and training helpers.
- `src/controltree/rendering.py`: tree rendering and visualization support.
- `src/controltree/workflow.py`: higher-level orchestration utilities.

## Installation / Running ControlTree

For Windows users, each [GitHub Release](https://github.com/daniel-vital-de-alcantara/ControlTree/releases)
provides two ways to run the browser workbench:

- **ControlTree Setup or Portable EXE** is the normal option. It contains
  everything required and does not need Python, Node.js, or other development
  tools.
- **ControlTree Python ZIP** is the fallback for protected corporate machines
  that allow Python scripts but block packaged applications. Extract the whole
  ZIP and double-click `START_CONTROLTREE.bat`. It requires Python 3.10 or
  newer, but it does not need Node.js, npm, Git, administrator access, `pip`, or
  an internet connection after download. The included Python launcher serves
  the pre-built React interface only to the local computer and opens it in the
  default browser.

The Python ZIP deliberately uses only Python's standard library. ControlTree's
current data processing runs in the included browser interface, so creating a
virtual environment or downloading dependencies would add failure points
without adding functionality. In both distributions, dataset rows remain on
the user's computer.

### Python library development

For Python library development rather than running the workbench:

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

## Browser workbench

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

Clicking the project name in the workspace opens Save As, while the status dot
shows whether the current configuration differs from the last saved version.
Project files remain lightweight and data-free: they store the source filename
and basic file metadata as a re-selection hint, never the dataset rows or an
absolute local path. The data-source action can test a replacement CSV or Excel
file against the current tree and keeps the existing source unchanged when the
replacement is incompatible.

The selected-node Distribution tab provides numeric statistics and histograms
or categorical frequency bars. Histogram widths can be set explicitly, and the
chosen variable, width, and scale remain stable while moving between nodes. An
opt-in presentation control adds the current node's calculated distribution
below the synchronized tree without sending source rows to the presentation
window.

CSV number inference recognizes both comma and dot decimal conventions,
including common thousands separators. Variables with leading-zero values are
kept categorical by default. The Tree configurator's Variable types section can
override any column as automatic, numeric, or categorical; those overrides are
used consistently by splits, targets, distributions, and metrics and are saved
in project files. Excel workbooks are parsed in a background worker so the
opening screen remains responsive and shows elapsed time plus a CSV performance
tip for longer imports.

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
GitHub Releases as a conventional installer, a portable executable, a portable
EXE ZIP, and a Python fallback ZIP. All distributions contain the same React
interface and private browser calculation engine, and dataset rows remain on
the user's computer. The packaged desktop options need neither Node.js nor
Python. The Python fallback needs Python 3.10 or newer but no third-party
packages. The full Python analysis engine remains available for future
desktop-only advanced analysis.
