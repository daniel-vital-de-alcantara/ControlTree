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

### Keyboard navigation

ControlTree supports desktop-style keyboard operation in the browser and
Windows packages. `Tab` and `Shift+Tab` move between the main toolbar, tree,
view controls, and the open side pane. Arrow keys move within the focused
region; in the tree they follow parents, children, and siblings. The number
keys `1` through `9` and `0` open tools in toolbar order. Common commands such
as save, undo, redo, node search, copy/cut/paste, delete, zoom, and fit-to-view
use familiar platform shortcuts. Normal typing always takes priority in text,
number, search, and selection fields. The complete platform-aware reference is
available from **Guide → Keyboard shortcuts**.

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

The repository is set up for Sphinx-based documentation, and the root `README.md` is the canonical package overview. A concise user guide and the live keyboard shortcut reference are also built into the application.

## Browser workbench

The `web/` directory contains a React workbench for choosing a CSV or Excel
dataset and building a tree without requiring a target. Manual splits,
distributions, metrics, presentation, and saved-tree replay work independently.
When recommended splits are needed, an optional recommendation target is chosen
inside the Node inspector. Categorical targets are ranked by Gini gain and
continuous targets by variance reduction. Split scoring, manual branching, and
saved-tree replay all run in the browser: uploaded rows never leave the user's
device. The Titanic demo remains available without an upload.

The Split tool supports recommended binary splits, manual numeric or
categorical multiway splits, reproducible random sample groups, and percentile
groups. Percentiles can be divided into any equal group count from 2 through 20,
or defined with exact custom cuts such as 90%, 95%, 99%, and 99.9%. Its searchable variable list includes the target at the end for manual
or percentile splitting even though the target is intentionally not scored
against itself. The Tree configurator controls node, accent,
connector, and canvas colors and can show or hide the dotted grid. Its Metrics
section controls the standard node fields and supports unlimited calculated
metrics. A metric can combine two calculations—for example a compact sum with
its percentage of the root—and row counts can similarly include a root or
parent share. Every metric can independently receive highlighted treatment in
the node cards.
The Split tool starts by ranking variables, then shows up to three recommended
rules for the chosen variable alongside the manual option. Recommendation work
runs in a browser worker so the canvas remains interactive and reports elapsed
calculation time. Existing nodes reopen on their saved rule and can replace it,
insert a new rule above it while reapplying the existing subtree, or remove the
split and its descendants.
Right-clicking a node opens ControlTree-specific actions for renaming, focusing
or collapsing branches, copying one split or an entire split subtree, pasting
rules into another node or app window, and trimming descendants. The ten most
recent node names are saved with the project and offered as rename suggestions.
Copied subtrees preserve valid steps even when a deeper rule is incompatible
with the destination. Empty branches remain visible for structural consistency,
while distribution and quality calculations naturally skip them.
The presentation button opens a second, synchronized tree-only window for live
client sessions. It receives the tree and calculated display values, not raw
dataset rows. The same tool can download a clean PNG of the complete tree or an
enriched CSV whose leading columns identify each row's terminal node. When a
target is configured, the CSV also includes the node prediction and either a
numeric residual or categorical zero-or-one error. A tree can also be downloaded as a versioned, data-free
`.controltree.json` file. After choosing a compatible newer dataset on the
opening screen, that file can replay the split rules, colors, and summary
settings while recalculating every node from the new rows.

Tree settings include independent text-size and node-spacing controls, making
the same tree easy to tune for a compact screenshot or a more readable client
presentation. These settings are saved with the project and applied consistently
in the workspace, presentation mode, and PNG exports.

Clicking the project name in the workspace opens Save As, while the status dot
shows whether the current configuration differs from the last saved version.
Project files remain lightweight and data-free: they store the source filename
and basic file metadata as a re-selection hint, never the dataset rows or an
absolute local path. The data-source action can test a replacement CSV or Excel
file against the current tree and keeps the existing source unchanged when the
replacement is incompatible.

The selected-node Distribution tool opens into three workflows: basic
statistics and histograms, random examples from a selected chart bucket, and a
two-variable scatter plot. Variable selectors are searchable and the example
workflow supports any number of output columns plus reshuffling. Histograms
accept an exact bin width, preserve true zero-height bars, label several
non-overlapping axis points, and combine an excessively long tail into a final
overflow bin. When a numeric target is configured, its average is overlaid as
a line across the selected variable's buckets; selecting the target itself
hides that redundant comparison. Scatter plots can use the target as the
automatic second variable, accept explicit axis bounds, and report excluded
rows. The chosen distribution variable, width, and scale remain stable while
moving between nodes. An opt-in presentation control adds the current node's
calculated distribution beside the synchronized tree without sending source
rows to the presentation window.

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
