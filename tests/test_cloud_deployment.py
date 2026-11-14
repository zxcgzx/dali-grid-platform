import base64
import http.client
import json
import os
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'releases' / 'v051-platform-a'))
import serve_cloud


class CloudDeploymentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with patch.dict(os.environ, {'DALI_PUBLIC_URL': 'https://platform.example', 'DALI_ACCESS_PASSWORD': '', 'DALI_API_ALLOWED_HOSTS': ''}):
            cls.server = serve_cloud.create_server('127.0.0.1', 0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, path, payload=None, headers=None):
        h = {'Host': 'platform.example', 'Origin': 'https://platform.example'}
        raw = None if payload is None else json.dumps(payload)
        if raw is not None:
            h['Content-Type'] = 'application/json'
            h['X-Dali-Token'] = self.server.token
        h.update(headers or {})
        c = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=25)
        c.request('GET' if raw is None else 'POST', path, raw, h)
        response = c.getresponse()
        status, body = response.status, response.read()
        c.close()
        return status, body

    def test_public_page_and_resources(self):
        status, body = self.request('/')
        self.assertEqual(status, 200)
        self.assertIn(b'demo-bridge.js', body)
        self.assertEqual(self.request('/platform-a.css')[0], 200)
        self.assertEqual(self.request('/api/session')[0], 200)

    def test_health(self):
        self.assertEqual(self.request('/healthz', headers={'Host': 'health.internal'})[0], 200)

    def test_bad_origin_and_host(self):
        self.assertEqual(self.request('/', headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('/', headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request('/', headers={'Sec-Fetch-Site': 'cross-site'})[0], 403)

    def test_optional_password(self):
        self.server.access_password = 'test-only'
        try:
            self.assertEqual(self.request('/')[0], 401)
            auth = 'Basic ' + base64.b64encode(b'demo:test-only').decode()
            self.assertEqual(self.request('/', headers={'Authorization': auth})[0], 200)
        finally:
            self.server.access_password = ''

    def test_proxy_denied_until_allowlisted(self):
        status, _ = self.request('/api/proxy', {'service': 'primary', 'url': 'https://unapproved.example/v1'})
        self.assertEqual(status, 403)

    def test_static_private_paths_denied(self):
        for path in ['/serve_cloud.py', '/tests/test.py', '/artifacts/report.json', '/.git/config', '/../../serve.py']:
            self.assertEqual(self.request(path)[0], 403, path)

    def test_compile_and_real_solve(self):
        status, body = self.request('/api/demo/info')
        self.assertEqual(status, 200)
        spec = json.loads(body)['spec']
        status, body = self.request('/api/demo/compile', {'spec': spec})
        self.assertEqual(status, 200)
        compiled = json.loads(body)
        status, body = self.request('/api/demo/solve', {'spec': spec, 'expected_spec_sha256': compiled['spec_sha256']})
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result['status'], 'optimal')
        self.assertTrue(result['checks']['numerically_feasible_for_this_model'])
        self.assertGreater(result['objective_yuan'], 0)

    def test_missing_token_denied(self):
        self.assertEqual(self.request('/api/demo/compile', {'spec': {}}, {'X-Dali-Token': ''})[0], 403)


if __name__ == '__main__':
    unittest.main()
