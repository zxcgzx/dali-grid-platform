"""Cloud entrypoint for platform A V0.7; local server remains unchanged."""
import os
import secrets
import threading
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
from server import Handler, BUILD


class CloudHandler(Handler):
    def origin_ok(self):
        origin = self.headers.get('Origin')
        shared_link = (self.command == 'GET' and urlsplit(self.path).path in ('/', '/index.html')
                       and self.headers.get('Sec-Fetch-Mode') == 'navigate' and not origin)
        return (self.headers.get('Host') in self.server.allowed_hosts
                and (not origin or origin in self.server.allowed_origins)
                and (self.headers.get('Sec-Fetch-Site') != 'cross-site' or shared_link))

    def do_GET(self):
        if self.path == '/healthz':
            return self.send_json({'status': 'ok', 'version': BUILD})
        return super().do_GET()

    def do_POST(self):
        # Avoid concurrent large model builds exhausting the free instance.
        if urlsplit(self.path).path == '/api/build':
            if not self.origin_ok() or not secrets.compare_digest(self.headers.get('X-Platform-Token', ''), self.server.token):
                return self.send_json({'error': '会话失效，请刷新页面'}, 403)
            if not self.server.cloud_build_lock.acquire(blocking=False):
                return self.send_json({'error': '已有模型正在构建，请稍后重试'}, 429)
            try:
                return super().do_POST()
            finally:
                self.server.cloud_build_lock.release()
        return super().do_POST()

    def proxy(self, body):
        target = urlsplit(body.get('url', ''))
        if target.scheme != 'https' or target.hostname not in self.server.api_hosts:
            return self.send_json({'error': '请由管理员在 DALI_API_ALLOWED_HOSTS 中允许该 HTTPS API 主机名'}, 403)
        if os.environ.get('PLATFORM_' + str(body.get('service', '')).upper() + '_API_KEY'):
            return self.send_json({'error': '公开演示请在页面填写自己的 API 密钥，不使用共享服务端密钥'}, 403)
        return super().proxy(body)


def create_server(host='0.0.0.0', port=10000):
    public_url = os.environ.get('DALI_PUBLIC_URL', '').rstrip('/')
    render_host = os.environ.get('RENDER_EXTERNAL_HOSTNAME', '')
    if not public_url and render_host:
        public_url = 'https://' + render_host
    if public_url:
        u = urlsplit(public_url)
        if u.scheme != 'https' or not u.netloc or u.username or u.password or u.path or u.query or u.fragment:
            raise ValueError('DALI_PUBLIC_URL must be an HTTPS origin')
    elif host not in ('127.0.0.1', 'localhost'):
        raise ValueError('Public hosting requires DALI_PUBLIC_URL or RENDER_EXTERNAL_HOSTNAME')
    s = ThreadingHTTPServer((host, port), CloudHandler)
    s.daemon_threads = True
    s.token = secrets.token_urlsafe(32)
    s.allow_private = False
    s.compute_lock = threading.Lock()
    s.cloud_build_lock = threading.Lock()
    s.api_hosts = {h.strip().lower() for h in os.environ.get('DALI_API_ALLOWED_HOSTS', '').split(',') if h.strip()}
    local = {f'127.0.0.1:{s.server_port}', f'localhost:{s.server_port}'}
    s.allowed_hosts = local | ({urlsplit(public_url).netloc} if public_url else set())
    s.allowed_origins = {'http://' + h for h in local} | ({public_url} if public_url else set())
    return s


if __name__ == '__main__':
    s = create_server(port=int(os.environ.get('PORT', '10000')))
    print(f'Platform A {BUILD} cloud service listening on port {s.server_port}', flush=True)
    try:
        s.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        s.server_close()
