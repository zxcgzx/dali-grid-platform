"""V0.5 addon: same nine-module UI + bounded four-node real calculation API."""
from __future__ import annotations
import argparse, json, secrets, threading, webbrowser
from urllib.parse import urlparse
from serve import Handler, ThreadingHTTPServer, ROOT
import demo_solver as demo

class DemoHandler(Handler):
    def do_GET(self):
        path = urlparse(self.path).path
        if path in ('/','/index.html'):
            if not self.origin_ok(): return self.output({'error':True},403)
            raw=(ROOT/'index.html').read_text(encoding='utf-8').replace('</body>','<script src="demo-bridge.js?v=1"></script></body>').encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw);return
        if path=='/api/demo/info':
            if not self.origin_ok(): return self.output({'error':True},403)
            return self.output({'prompt':demo.PROMPT,'spec':demo.default_spec(),'extraction_schema':demo.schema(),'profile':demo.PROFILE})
        return super().do_GET()
    def do_POST(self):
        if self.path not in ('/api/demo/compile','/api/demo/solve'): return super().do_POST()
        if not self.origin_ok() or not secrets.compare_digest(self.headers.get('X-Dali-Token',''),self.server.token): return self.output({'error':True,'safe_message':'来源或会话令牌无效'},403)
        acquired=False
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=120000 or 'application/json' not in self.headers.get('Content-Type',''): raise ValueError('请求格式或大小错误')
            x=json.loads(self.rfile.read(n))
            if not isinstance(x,dict) or 'spec' not in x: raise ValueError('请求缺少spec')
            if self.path.endswith('/compile'): return self.output(demo.compile_spec(x['spec']))
            if not isinstance(x.get('expected_spec_sha256'),str) or len(x['expected_spec_sha256'])!=64: raise ValueError('求解必须绑定已确认规格指纹')
            acquired=self.server.solve_lock.acquire(blocking=False)
            if not acquired: return self.output({'error':True,'safe_message':'已有示例计算正在运行'},409)
            result=demo.solve(x['spec'],x['expected_spec_sha256'])
            self.output(result)
        except (ValueError,TypeError,KeyError) as e: self.output({'error':True,'safe_message':str(e)[:240]},400)
        except ImportError: self.output({'error':True,'safe_message':'当前Python缺少NumPy或SciPy；请选择已安装它们的Python环境'},503)
        except Exception: self.output({'error':True,'safe_message':'示例计算未完成，未生成成功结论'},500)
        finally:
            if acquired:self.server.solve_lock.release()

def create_server(port=8766,allow_private=False):
    s=ThreadingHTTPServer(('127.0.0.1',port),DemoHandler);s.daemon_threads=True;s.token=secrets.token_urlsafe(32);s.allow_private=allow_private;s.solve_lock=threading.Lock();return s

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8766);p.add_argument('--no-open',action='store_true');p.add_argument('--allow-private-api',action='store_true');a=p.parse_args()
    s=create_server(a.port,a.allow_private_api);url=f'http://127.0.0.1:{s.server_port}';print('Operation Mode Platform A: '+url,flush=True)
    print('Four-node transport MILP only; no arbitrary generated-code execution. Ctrl+C to stop.',flush=True)
    if not a.no_open: threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try:s.serve_forever()
    except KeyboardInterrupt:pass
    finally:s.server_close()
if __name__=='__main__':main()
