"""Public hosting entrypoint for the bounded platform-A demonstration."""
from __future__ import annotations

import base64
import binascii
import json
import os
import secrets
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

from serve_demo import DemoHandler


class CloudHandler(DemoHandler):
    def origin_ok(self):
        host = self.headers.get('Host', '')
        origin = self.headers.get('Origin')
        shared_link = (self.command == 'GET' and urlsplit(self.path).path in ('/', '/index.html')
                       and self.headers.get('Sec-Fetch-Mode') == 'navigate' and not origin)
        return (host in self.server.allowed_hosts
                and (not origin or origin in self.server.allowed_origins)
                and (self.headers.get('Sec-Fetch-Site') != 'cross-site' or shared_link))

    def authorized(self):
        if not self.server.access_password:
            return True
        try:
            kind, encoded = self.headers.get('Authorization', '').split(' ', 1)
            if kind.lower() != 'basic':
                return False
            username, password = base64.b64decode(encoded, validate=True).decode('utf-8').split(':', 1)
            return (secrets.compare_digest(username.encode(), b'demo')
                    and secrets.compare_digest(password.encode(), self.server.access_password.encode()))
        except (ValueError, UnicodeError, binascii.Error):
            return False

    def require_access(self):
        if not self.origin_ok():
            self.output({'error': True}, 403)
            return False
        if self.authorized():
            return True
        data = b'Authentication required'
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="Platform A", charset="UTF-8"')
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
        return False

    def do_GET(self):
        if self.path == '/healthz':
            return self.output({'status': 'ok'})
        if self.require_access():
            return super().do_GET()

    def do_POST(self):
        if not self.require_access():
            return
        if self.path == '/api/proxy':
            if not secrets.compare_digest(self.headers.get('X-Dali-Token', ''), self.server.token):
                return self.output({'error': True, 'safe_message': '会话令牌无效'}, 403)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 5_000_000:
                    raise ValueError('请求大小不正确')
                raw = self.rfile.read(length)
                body = json.loads(raw)
                target = urlsplit(body.get('url', ''))
                if target.scheme != 'https' or target.hostname not in self.server.api_hosts:
                    return self.output({'error': True, 'safe_message': '请先由管理员在 DALI_API_ALLOWED_HOSTS 中允许该 HTTPS API 域名'}, 403)
                service = body.get('service', '')
                if os.environ.get('DALI_' + str(service).upper() + '_API_KEY'):
                    return self.output({'error': True, 'safe_message': '云端演示不支持共享环境变量模型密钥，请由访客在页面填写自己的密钥'}, 403)
                import io
                self.rfile = io.BytesIO(raw)
            except (ValueError, TypeError, AttributeError):
                return self.output({'error': True, 'safe_message': '请求格式不正确'}, 400)
        return super().do_POST()


def create_server(host='0.0.0.0', port=10000):
    public_url = os.environ.get('DALI_PUBLIC_URL', '').rstrip('/')
    render_host = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '')
    if not public_url and render_host:
        public_url = 'https://' + render_host
    if public_url:
        parsed = urlsplit(public_url)
        if (parsed.scheme != 'https' or not parsed.netloc or parsed.username
                or parsed.password or parsed.path or parsed.query or parsed.fragment):
            raise ValueError('DALI_PUBLIC_URL must be an HTTPS origin without a path')
    elif host not in ('127.0.0.1', 'localhost'):
        raise ValueError('Set DALI_PUBLIC_URL or RENDER_EXTERNAL_HOSTNAME for public hosting')
    server = ThreadingHTTPServer((host, port), CloudHandler)
    server.daemon_threads = True
    server.token = secrets.token_urlsafe(32)
    server.allow_private = False
    server.solve_lock = threading.Lock()
    server.access_password = os.environ.get('DALI_ACCESS_PASSWORD', '')
    server.api_hosts = {h.strip().lower() for h in os.environ.get('DALI_API_ALLOWED_HOSTS', '').split(',') if h.strip()}
    local_hosts = {f'127.0.0.1:{server.server_port}', f'localhost:{server.server_port}'}
    server.allowed_hosts = local_hosts | ({urlsplit(public_url).netloc} if public_url else set())
    server.allowed_origins = {'http://' + h for h in local_hosts} | ({public_url} if public_url else set())
    return server


if __name__ == '__main__':
    server = create_server(port=int(os.environ.get('PORT', '10000')))
    print(f'Platform A cloud service listening on port {server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
