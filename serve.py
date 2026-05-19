#!/usr/bin/env python3
"""Dev HTTP server with Cache-Control: no-store on all responses."""
import http.server
import os

PORT = 8125
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # suppress request logs

if __name__ == '__main__':
    with http.server.HTTPServer(('', PORT), NoCacheHandler) as httpd:
        print(f'Serving {DIRECTORY} on http://localhost:{PORT}')
        httpd.serve_forever()
