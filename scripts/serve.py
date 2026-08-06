# -*- coding: utf-8 -*-
"""
serve.py — Servidor estático local con gzip precomprimido.

Sirve la raíz del proyecto (la web queda en http://localhost:PORT/web/), usando,
cuando existe, la versión <archivo>.gz con Content-Encoding: gzip (data.js y
data_home.js ya vienen comprimidos por build_data.py). El navegador descomprime
de forma transparente. También expone corpus/ (pinturas y poetas).

Uso:
  python serve.py [puerto]     # por defecto 8000
"""

import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class GzipHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path)
        gz_path = path + ".gz"
        accepts_gzip = "gzip" in (self.headers.get("Accept-Encoding", "") or "")
        if os.path.isfile(gz_path) and not os.path.isdir(path) and accepts_gzip:
            ctype = self.guess_type(path)
            size = os.path.getsize(gz_path)
            mtime = os.path.getmtime(gz_path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(size))
            self.send_header("Last-Modified", self.date_time_string(mtime))
            self.end_headers()
            return open(gz_path, "rb")
        if path.endswith(".gz") and os.path.isfile(path):
            ctype = self.guess_type(path[:-3])
            size = os.path.getsize(path)
            mtime = os.path.getmtime(path)
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
            self.send_header("Content-Length", str(size))
            self.send_header("Last-Modified", self.date_time_string(mtime))
            self.end_headers()
            return open(path, "rb")
        return super().send_head()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("", PORT), GzipHandler).serve_forever()
