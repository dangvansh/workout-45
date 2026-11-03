"""Serves the app on http://localhost:8045 and opens it in your default browser.

This is Python's built-in http.server (same as `python -m http.server 8045`),
with two small additions: the right content type for the .webmanifest file
and "no-cache" headers so edits to config.js show up on reload.
Started by start.bat. Close the window (or press Ctrl+C) to stop it.

Keep the port the same: the browser stores your data per address, so
http://localhost:8045 always has the same data.
"""
import functools
import http.server
import os
import socket
import sys
import threading
import webbrowser

PORT = 8045
HERE = os.path.dirname(os.path.abspath(__file__))
URL = f"http://localhost:{PORT}/"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the window quiet


def port_in_use():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def main():
    if port_in_use():
        print(f"The app server is already running - opening {URL}")
        webbrowser.open(URL)
        return
    handler = functools.partial(Handler, directory=HERE)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print("45 Days workout tracker")
    print(f"Running at {URL}")
    print("Leave this window open while you use the app. Close it to stop.")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(URL)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
