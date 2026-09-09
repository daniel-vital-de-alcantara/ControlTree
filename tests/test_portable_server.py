"""Tests for the dependency-free Python fallback server."""

from __future__ import annotations

import importlib.util
import json
import threading
from pathlib import Path
from urllib.request import urlopen


SERVER_PATH = Path(__file__).parents[1] / "portable_python" / "controltree_server.py"


def load_server_module():
    spec = importlib.util.spec_from_file_location("controltree_portable_server", SERVER_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_portable_server_serves_frontend_and_health(tmp_path: Path) -> None:
    module = load_server_module()
    (tmp_path / "index.html").write_text("<h1>ControlTree</h1>", encoding="utf-8")
    server = module.create_server(tmp_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        base_url = f"http://127.0.0.1:{server.server_address[1]}"
        with urlopen(f"{base_url}/", timeout=3) as response:
            assert b"ControlTree" in response.read()
        with urlopen(f"{base_url}/api/health", timeout=3) as response:
            assert json.load(response) == {"status": "ok"}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_windows_launcher_checks_common_python_commands() -> None:
    launcher = (SERVER_PATH.parent / "START_CONTROLTREE.bat").read_text(encoding="utf-8")

    assert 'py -3 -c "import sys"' in launcher
    assert 'py -c "import sys"' in launcher
    assert 'python -c "import sys"' in launcher
    assert 'python3 -c "import sys"' in launcher
    assert "^>=" not in launcher
