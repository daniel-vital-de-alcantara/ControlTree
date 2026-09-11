"""Serve the pre-built ControlTree workbench on this computer only."""

from __future__ import annotations

import argparse
import json
import sys
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MINIMUM_PYTHON = (3, 10)


class ControlTreeHandler(SimpleHTTPRequestHandler):
    """Static-file handler with a small endpoint for launcher diagnostics."""

    def do_GET(self) -> None:  # noqa: N802 - required by SimpleHTTPRequestHandler
        if self.path.rstrip("/") == "/api/health":
            payload = json.dumps({"status": "ok"}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()


def create_server(app_dir: Path, port: int = 0) -> ThreadingHTTPServer:
    """Create a loopback-only server for a built frontend directory."""
    handler = partial(ControlTreeHandler, directory=str(app_dir))
    return ThreadingHTTPServer(("127.0.0.1", port), handler)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start ControlTree in your browser.")
    parser.add_argument("--no-browser", action="store_true", help="Do not open a browser automatically.")
    parser.add_argument("--port", type=int, default=4173, help="Local port to use; the default is 4173.")
    return parser.parse_args()


def main() -> int:
    if sys.version_info < MINIMUM_PYTHON:
        required = ".".join(map(str, MINIMUM_PYTHON))
        current = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
        print(f"ERROR: ControlTree requires Python {required} or newer; found {current}.", flush=True)
        return 1

    args = parse_args()
    app_dir = Path(__file__).resolve().parent / "app"
    if not (app_dir / "index.html").is_file():
        print("ERROR: The bundled ControlTree interface is missing.", flush=True)
        print("Please extract the complete ZIP before starting ControlTree.", flush=True)
        return 1

    try:
        server = create_server(app_dir, args.port)
    except OSError as exc:
        print(f"ERROR: ControlTree could not start its local server: {exc}", flush=True)
        if args.port == 4173:
            print("Port 4173 is already in use. Close another ControlTree window and try again.", flush=True)
        return 1

    port = server.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    print("", flush=True)
    print("ControlTree is ready.", flush=True)
    print(f"Opening {url}", flush=True)
    print("The server is available only on this computer.", flush=True)
    print("Keep this window open while using ControlTree.", flush=True)
    print("Press Ctrl+C here when you are finished.", flush=True)
    print("", flush=True)

    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open_new_tab, args=(url,)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping ControlTree...", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
