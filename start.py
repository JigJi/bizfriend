"""
FriendTa local dev server.
- Serves static files from current directory.
- Cache-Control: no-store on all responses (browser never caches → no stale HTML during dev).
- Clean URL rewrite (mirrors Cloudflare Pages behavior): /login → login.html, /privacy → privacy.html, etc.
"""
import http.server
import socketserver
import os

PORT = 8201


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Clean URL rewrite: if the path has no extension and {path}.html exists, serve that.
        # E.g. /login -> login.html, /privacy -> privacy.html
        raw = self.path
        path = raw.split('?', 1)[0].split('#', 1)[0]
        rest = raw[len(path):]
        if path != '/' and not path.endswith('/') and not os.path.splitext(path)[1]:
            file_path = '.' + path + '.html'
            if os.path.isfile(file_path):
                self.path = path + '.html' + rest
        return super().do_GET()


class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    with ReusableTCPServer(('', PORT), Handler) as httpd:
        print()
        print(f'  FriendTa dev server')
        print(f'  http://localhost:{PORT}')
        print()
        print(f'  - Clean URLs enabled (e.g. /login serves login.html)')
        print(f'  - Cache: no-store (browser never caches)')
        print()
        print(f'  Press Ctrl+C to stop')
        print()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print()
            print('  Stopped.')
