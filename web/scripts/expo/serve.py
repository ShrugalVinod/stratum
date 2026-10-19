"""STRATUM expo server: serves ./site on http://127.0.0.1:8765 with no internet needed.

Paths without a file extension (/map, /results, …) get index.html, so every page works.
Standard library only (Python 3.8+)."""

import http.server
import os
import socketserver
import sys

PORT = int(os.environ.get("STRATUM_PORT", "8765"))
SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if "." not in os.path.basename(path) and not os.path.isdir(self.translate_path(path)):
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    print(f"STRATUM expo: http://127.0.0.1:{PORT}  (close this window to stop)")
    try:
        Server(("127.0.0.1", PORT), Handler).serve_forever()
    except OSError as e:
        sys.exit(f"Could not start on port {PORT}: {e}")
