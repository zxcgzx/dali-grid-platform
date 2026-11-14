"""Loopback-only API relay. No model deployment, solver, or generated-code execution."""
from __future__ import annotations
import argparse, ast, ipaddress, json, mimetypes, os, secrets, socket, threading, webbrowser
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
ROOT = Path(__file__).resolve().parent
SERVICES = {'primary','topic2Model','topic2Data','reviewer','validator','risk','reward'}
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('上游重定向已禁用')
class Handler(BaseHTTPRequestHandler):
    server_version = 'DaliResearch/0.5'
    def log_message(self, *args): pass
    def origin_ok(self):
        hosts = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        return self.headers.get('Host') in hosts and (not origin or origin in {'http://' + x for x in hosts}) and self.headers.get('Sec-Fetch-Site') != 'cross-site'
    def output(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(data))); self.end_headers()
        try: self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass
    def do_GET(self):
        if not self.origin_ok(): return self.output({'error':True},403)
        path = unquote(urlparse(self.path).path)
        if path == '/api/session': return self.output({'token':self.server.token,'version':'0.5'})
        if path.startswith('/api/'): return self.output({'error':True},404)
        rel = path.lstrip('/') or 'index.html'; p = (ROOT / rel).resolve()
        try: p.relative_to(ROOT)
        except ValueError: return self.output({'error':True},403)
        if p.suffix.lower() not in {'.html','.js','.css','.png','.svg','.json','.geojson','.md','.ico'} or any(k in rel.split('/') for k in ('reference','tests','artifacts','.git')): return self.output({'error':True},403)
        try: raw = p.read_bytes()
        except OSError: return self.output({'error':True},404)
        mime = {'.js':'text/javascript','.geojson':'application/geo+json','.md':'text/plain'}.get(p.suffix,mimetypes.guess_type(p.name)[0] or 'application/octet-stream')
        self.send_response(200); self.send_header('Content-Type',mime + ('; charset=utf-8' if p.suffix in {'.html','.js','.css','.json','.geojson','.md'} else '')); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Content-Length',str(len(raw))); self.end_headers()
        try: self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError): pass
    def do_POST(self):
        if not self.origin_ok() or not secrets.compare_digest(self.headers.get('X-Dali-Token',''),self.server.token): return self.output({'error':True,'safe_message':'来源或会话令牌无效'},403)
        try:
            length = int(self.headers.get('Content-Length','0'))
            if not 0 < length <= 5_000_000 or 'application/json' not in self.headers.get('Content-Type',''): raise ValueError('请求格式或大小不正确')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body,dict): raise ValueError('请求应为JSON对象')
            if self.path == '/api/check-code':
                source = body.get('source','')
                if not isinstance(source,str) or len(source)>200_000: raise ValueError('代码文本过大')
                result = {k:body.get(k) for k in ('task_id','model_version','model_hash','requirements_revision','data_fingerprint')}
                result.update(report_id='AST-'+secrets.token_hex(6),engine='python-ast-static',execution='not_run')
                if str(body.get('language','')).lower() != 'python':
                    result.update(syntax='not_run',findings=[{'severity':'info','message':'当前语言未配置语法解析器','evidence':'仅内置Python AST；未执行代码'}])
                else:
                    try:
                        ast.parse(source,filename='<model-code>')
                        result.update(syntax='passed',findings=[{'severity':'info','message':'Python语法解析通过','evidence':'仅ast.parse，不导入依赖、不执行代码、不证明模型正确'}])
                    except (SyntaxError,ValueError,RecursionError) as e:
                        result.update(syntax='failed',findings=[{'severity':'error','message':'Python语法解析失败','evidence':f'{type(e).__name__}; line={getattr(e,"lineno",None)}'}])
                return self.output(result)
            if self.path != '/api/proxy': return self.output({'error':True},404)
            service = body.get('service')
            if service not in SERVICES: raise ValueError('未知服务')
            url = body.get('url',''); parsed = urlparse(url)
            if parsed.scheme not in ('https','http') or not parsed.hostname or parsed.username or parsed.password or parsed.fragment: raise ValueError('目标地址不符合规则')
            if parsed.scheme != 'https' and not self.server.allow_private: raise ValueError('默认仅转发HTTPS；内网HTTP需显式启用参数')
            ips = {x[4][0] for x in socket.getaddrinfo(parsed.hostname,parsed.port or (443 if parsed.scheme=='https' else 80),type=socket.SOCK_STREAM)}
            if not self.server.allow_private and any(not ipaddress.ip_address(x).is_global for x in ips): raise ValueError('默认不转发内网API；可信内网服务需显式启用')
            method = body.get('method','POST')
            if method not in ('GET','POST'): raise ValueError('仅支持GET/POST')
            payload = body.get('payload'); raw = None if payload is None or method=='GET' else json.dumps(payload,ensure_ascii=False).encode()
            key = body.get('api_key') or os.environ.get('DALI_'+service.upper()+'_API_KEY','')
            if not isinstance(key,str) or '\r' in key or '\n' in key: raise ValueError('凭据格式错误')
            headers = {'Accept':'application/json','User-Agent':'DaliResearch/0.5'}
            if raw is not None: headers['Content-Type']='application/json'
            if key: headers['Authorization']='Bearer '+key
            with build_opener(NoRedirect()).open(Request(url,data=raw,headers=headers,method=method),timeout=120) as upstream: data=upstream.read(3_000_001)
            if len(data)>3_000_000: raise ValueError('接口响应过大')
            self.output(json.loads(data))
        except HTTPError as e: self.output({'error':True,'safe_message':f'上游返回HTTP {e.code}；检查地址、权限和额度'},502)
        except (ValueError,TypeError,KeyError) as e: self.output({'error':True,'safe_message':str(e)[:180]},400)
        except (URLError,OSError,TimeoutError): self.output({'error':True,'safe_message':'连接、DNS、证书或响应超时'},502)
        except Exception: self.output({'error':True,'safe_message':'请求未完成；未执行生成代码'},500)
def main():
    p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=int(os.environ.get('DALI_PORT','8765'))); p.add_argument('--no-open',action='store_true'); p.add_argument('--allow-private-api',action='store_true'); args=p.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler); server.daemon_threads=True; server.token=secrets.token_urlsafe(32); server.allow_private=args.allow_private_api
    url=f'http://127.0.0.1:{server.server_port}'; print('Dali modeling workspace: '+url,flush=True); print('No model deployment or solver execution. Ctrl+C to stop.',flush=True)
    if not args.no_open: threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
if __name__=='__main__': main()
