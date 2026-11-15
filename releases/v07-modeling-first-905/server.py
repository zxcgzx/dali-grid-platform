from __future__ import annotations
import argparse, ast, base64, io, hashlib, ipaddress, json, math, mimetypes, os, secrets, socket, threading, time, webbrowser
from zipfile import ZipFile, ZIP_DEFLATED
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, unquote
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
import engine
ROOT=Path(__file__).resolve().parent
BUILD='0.7.0-905'
SERVICES={'primary','qwen','zhenghao','proopf','topic2Model','topic2Data','reviewer','validator','allblue','mellolight','jiageng','risk','reward','solver','writeback','host'}
def reject_constant(x):raise ValueError('JSON包含非有限数值')
def loads(s):return json.loads(s,parse_constant=reject_constant)
def validate_result(result):
    if not isinstance(result,dict) or result.get('case_id')!='DALI905' or result.get('data_sha256')!=engine.CASE['sha256']:raise ValueError('结果与905断面版本不匹配')
    if result.get('schema_version')!='905-result.1':raise ValueError('结果格式版本需为905-result.1')
    if result.get('units')!={'angle':'rad','active_power':'MW','reactive_power':'Mvar','voltage':'p.u.'}:raise ValueError('结果单位需明确为rad、MW、Mvar和p.u.')
    if not isinstance(result.get('candidate_ids',[]),list) or any(oid not in engine.ENTITIES or not oid.startswith('L') for oid in result.get('candidate_ids',[])):raise ValueError('候选支路编号无效')

    periods=result.get('periods')
    if not isinstance(periods,list) or not 1<=len(periods)<=96:raise ValueError('结果时段范围无效')
    if result.get('bus_ids')!=[x['id'] for x in engine.CASE['buses']] or result.get('generator_ids')!=[x['id'] for x in engine.CASE['generators']]:raise ValueError('母线或机组编号顺序不一致')
    seen=set()
    for p in periods:
        t=p.get('t')
        if type(t) is not int or not 1<=t<=96 or t in seen:raise ValueError('结果时段编号无效或重复')
        seen.add(t)
        for side in ('before','after'):
            if side not in p:continue
            if not isinstance(p[side],dict):raise ValueError('结果状态无效')
            for f,n in [('vm',905),('va',905),('pg',237),('qg',237),('pf',1000),('qf',1000),('pt',1000),('qt',1000)]:
                a=p[side].get(f)
                if a is not None and (not isinstance(a,list) or len(a)!=n or any(not engine.finite(v) for v in a)):raise ValueError(side+'.'+f+'长度或数值无效')
        if not isinstance(p.get('after'),dict):raise ValueError('缺少方案状态')
        if any(oid not in engine.ENTITIES or not oid.startswith('L') for oid in p.get('open_branches',[])):raise ValueError('结果含未知开断支路')
        for key in ['n1_before','n1_after']:
            if key not in p:continue
            info=p[key]
            if not isinstance(info,dict) or not isinstance(info.get('details'),list) or not info['details']:raise ValueError('N−1结果需提供逐场景记录')
            seen_events=set()
            for d in info['details']:
                if not isinstance(d,dict) or d.get('element') not in engine.ENTITIES or d['element'] in seen_events:raise ValueError('N−1对象缺失或重复')
                if any(type(d.get(k)) is not bool for k in ['converged','strict','incremental','emergency']):raise ValueError('N−1判据需为布尔值')
                if not d['converged'] and any(d[k] for k in ['strict','incremental','emergency']):raise ValueError('未收敛场景不能标记通过')
                seen_events.add(d['element'])
            info['total']=len(info['details'])
            for k in ['converged','strict','incremental','emergency']:info[k]=sum(d[k] for d in info['details'])

    return result
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('不允许接口重定向')
class Handler(BaseHTTPRequestHandler):
    server_version='OperationModeA/'+BUILD
    def log_message(self,*args):pass
    def origin_ok(self):
        hosts={f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'};origin=self.headers.get('Origin')
        return self.headers.get('Host') in hosts and (not origin or origin in {'http://'+x for x in hosts}) and self.headers.get('Sec-Fetch-Site')!='cross-site'
    def send_json(self,x,status=200):
        raw=json.dumps(x,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(raw)));self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_GET(self):
        if not self.origin_ok():return self.send_json({'error':'请求来源无效'},403)
        path=unquote(urlparse(self.path).path)
        if path=='/api/session':return self.send_json({'token':self.server.token,'version':BUILD,'platform':'运行方式智能调整平台A'})
        if path=='/api/case':return self.send_json(engine.CASE)
        if path=='/api/scenarios':return self.send_json(engine.SCENARIOS)
        if path=='/api/archive':return self.send_json(json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8')))
        if path=='/api/archive/ACOTS':return self.send_json(json.loads((ROOT/'data/reference_result.json').read_text(encoding='utf-8')))
        if path=='/api/schema':return self.send_json(json.loads((ROOT/'data/model-spec.schema.json').read_text(encoding='utf-8')))
        if path=='/api/features':return self.send_json(json.loads((ROOT/'data/features.json').read_text(encoding='utf-8')))
        if path.startswith('/api/'):return self.send_json({'error':'接口不存在'},404)
        rel=path.lstrip('/') or 'index.html';file=(ROOT/rel).resolve()
        try:file.relative_to(ROOT)
        except ValueError:return self.send_json({'error':'路径无效'},403)
        if any(p.startswith('.') or p in ['tests','artifacts','tools','reference','docs','runtime','source'] for p in Path(rel).parts):return self.send_json({'error':'路径不可访问'},403)
        if file.suffix not in ['.html','.css','.js','.json','.geojson','.png','.svg','.ico']:return self.send_json({'error':'文件不可访问'},403)
        try:raw=file.read_bytes()
        except OSError:return self.send_json({'error':'文件不存在'},404)
        mime={'.js':'text/javascript','.geojson':'application/geo+json'}.get(file.suffix,mimetypes.guess_type(file.name)[0] or 'application/octet-stream');self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");self.end_headers()
        try:self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError):pass
    def do_POST(self):
        if not self.origin_ok() or not secrets.compare_digest(self.headers.get('X-Platform-Token',''),self.server.token):return self.send_json({'error':'会话失效，请刷新页面'},403)
        acquired=False
        try:
            n=int(self.headers.get('Content-Length',0))
            if not 0<n<=8_000_000 or 'application/json' not in self.headers.get('Content-Type',''):raise ValueError('请求格式无效')
            body=loads(self.rfile.read(n))
            if not isinstance(body,dict):raise ValueError('请求必须为JSON对象')
            p=urlparse(self.path).path
            if p=='/api/analyze':return self.send_json(engine.analyze(body.get('prompt')))
            if p=='/api/compile':return self.send_json(engine.compile_spec(body.get('spec')))
            if p=='/api/model/package':
                compiled=engine.compile_spec(body.get('spec'));buf=io.BytesIO()
                with ZipFile(buf,'w',ZIP_DEFLATED) as z:
                    z.writestr('model-spec.json',json.dumps(compiled['spec'],ensure_ascii=False,indent=2))
                    z.writestr('build.py',compiled['code'])
                    z.writestr('requirements.txt','numpy\nscipy\npyomo\n')
                    z.writestr('README.md','# 905节点模型包\n\n安装requirements.txt后运行python build.py。该命令构建当前规格，不执行优化。求解通过平台黑盒服务提交。\n')
                    for name in ['engine.py','model_backend.py','data/case905.json']:z.write(ROOT/name,name)
                return self.send_json({'filename':'905-model-package.zip','content_base64':base64.b64encode(buf.getvalue()).decode()})
            if p=='/api/validate':return self.send_json(engine.validation(body.get('spec')))
            if p=='/api/build':
                if not isinstance(body.get('spec'),dict) or body['spec'].get('R',{}).get('periods',97)>16:raise ValueError('本机构建检查最多16时段')

                from model_backend import build_summary
                return self.send_json(build_summary(engine.CASE,body.get('spec')))
            if p=='/api/solve':return self.send_json({'error':'求解通过独立黑盒服务提交'},501)
            if p=='/api/risk/mock':return self.send_json(engine.risk_simulation(body.get('spec'),body.get('level','高')))
            if p=='/api/risk/apply':return self.send_json(engine.apply_risk(body.get('spec'),body.get('report'),body.get('accepted')))
            if p=='/api/evaluate':return self.send_json(engine.evaluate_cases(body.get('cases')))
            if p=='/api/results/import':
                r=validate_result(body.get('result'));r['origin']='imported';return self.send_json(r)
            if p=='/api/code/check':
                source=body.get('source','')
                if not isinstance(source,str) or len(source)>200000:raise ValueError('代码过大')
                try:ast.parse(source);return self.send_json({'status':'pass','check':'Python语法'})
                except (SyntaxError,ValueError) as e:return self.send_json({'status':'failed','check':'Python语法','line':getattr(e,'lineno',None)})
            if p=='/api/coordinates':
                points=body.get('points');cs=body.get('crs')
                if cs not in ['WGS84','GCJ02']:raise ValueError('请指定WGS84或GCJ02坐标系')
                if not isinstance(points,list) or len(points)>905:raise ValueError('坐标表范围无效')
                seen=set()
                for point in points:
                    if point.get('id') not in engine.ENTITIES or not point['id'].startswith('B') or point['id'] in seen:raise ValueError('坐标含未知或重复母线')
                    if not engine.finite(point.get('lon')) or not engine.finite(point.get('lat')) or not -180<=point['lon']<=180 or not -90<=point['lat']<=90:raise ValueError('经纬度无效')
                    seen.add(point['id'])
                return self.send_json({'points':points,'crs':cs,'count':len(points)})
            if p=='/api/proxy':return self.proxy(body)
            return self.send_json({'error':'接口不存在'},404)
        except ImportError:return self.send_json({'error':'计算环境缺少依赖，请使用已安装NumPy、SciPy和Pyomo的Python'},503)
        except (ValueError,TypeError,KeyError,AttributeError) as e:return self.send_json({'error':str(e)[:300]},400)
        except Exception:return self.send_json({'error':'任务未完成，请检查输入与服务状态'},500)
        finally:
            if acquired:self.server.compute_lock.release()
    def proxy(self,body):
        if body.get('service') not in SERVICES:raise ValueError('服务名称无效')
        url=body.get('url','');u=urlparse(url)
        if u.scheme not in ['https','http'] or not u.hostname or u.username or u.password or u.fragment:raise ValueError('API地址无效')
        if not self.server.allow_private and u.scheme!='https':raise ValueError('公共API须使用HTTPS；内网API请以--allow-private-api启动')
        addresses={r[4][0] for r in socket.getaddrinfo(u.hostname,u.port or (443 if u.scheme=='https' else 80),type=socket.SOCK_STREAM)}
        if not self.server.allow_private and any(not ipaddress.ip_address(a).is_global for a in addresses):raise ValueError('内网API须显式启用')
        method=body.get('method','POST')
        if method not in ['GET','POST']:raise ValueError('API方法不支持')
        key=body.get('api_key') or os.environ.get('PLATFORM_'+body['service'].upper()+'_API_KEY','')
        if not isinstance(key,str) or '\n' in key or '\r' in key:raise ValueError('密钥格式无效')
        headers={'Accept':'application/json','Content-Type':'application/json'}
        if key:headers['Authorization']='Bearer '+key
        raw=json.dumps(body.get('payload'),ensure_ascii=False,allow_nan=False).encode() if method=='POST' else None
        try:
            with build_opener(NoRedirect()).open(Request(url,data=raw,headers=headers,method=method),timeout=120) as r:content=r.read(5_000_001)
            if len(content)>5_000_000:raise ValueError('API响应过大')
            return self.send_json(loads(content))
        except HTTPError as e:return self.send_json({'error':'API返回HTTP '+str(e.code)},502)
        except (URLError,OSError,TimeoutError):return self.send_json({'error':'API连接失败或超时'},502)

def create_server(port=8770,allow_private=False):
    s=ThreadingHTTPServer(('127.0.0.1',port),Handler);s.daemon_threads=True;s.token=secrets.token_urlsafe(32);s.allow_private=allow_private;s.compute_lock=threading.Lock();return s

def main():
    a=argparse.ArgumentParser();a.add_argument('--port',type=int,default=8770);a.add_argument('--no-open',action='store_true');a.add_argument('--allow-private-api',action='store_true');args=a.parse_args();s=create_server(args.port,args.allow_private_api);url=f'http://127.0.0.1:{s.server_port}';print('Operation Mode Platform A '+BUILD+' '+url,flush=True)
    if not args.no_open:threading.Timer(.6,lambda:webbrowser.open(url)).start()
    try:s.serve_forever()
    except KeyboardInterrupt:pass
    finally:s.server_close()
if __name__=='__main__':main()
