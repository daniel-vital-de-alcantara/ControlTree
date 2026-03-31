"""Sphinx configuration for the ``controltree`` documentation."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

project = "controltree"
copyright = "2026, ControlTree Contributors"
author = "ControlTree Contributors"
release = "0.1.0"

extensions = [
    "sphinx.ext.autodoc",
    "sphinx.ext.autosummary",
]
templates_path = ["_templates"]
exclude_patterns = ["_build"]

autosummary_generate = True
autodoc_member_order = "bysource"
autoclass_content = "both"

html_theme = "alabaster"
