"""Reproducible local demo tests; no external model API is called."""
from __future__ import annotations
import json,sys,threading,urllib.request,urllib.error,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from demo_solver import default_spec,compile_spec,solve,normalize
from serve_demo import create_server
from playwright.sync_api import sync_playwright
checks=[]
def check(name,condition):
    if not condition: raise AssertionError(name)
    checks.append(name)
def bad(name,fn):
    try:fn()
    except (ValueError,TypeError):checks.append(name);return
    raise AssertionError(name)
s=default_spec();r=solve(s)
check('real optimum 55200',r['status']=='optimal' and abs(r['objective_yuan']-55200)<1e-6)
check('base independent residuals',r['checks']['numerically_feasible_for_this_model'])
x=default_spec();x['nodes'][3]['load_mw']=80
check('changed load re-solves to 45200',abs(solve(x)['objective_yuan']-45200)<1e-6)
x=default_spec();x['lines'][2]['capacity_mw']=80
rr=solve(x)
check('line capacity update changes switch plan',rr['objective_yuan']==55300 and [a['on'] for a in rr['lines']]==[1,1,1,1,0])
x=default_spec();x['nodes'][3]['load_mw']=250
rr=solve(x)
check('infeasible has no fake incumbent',rr['status']=='infeasible' and rr['objective_yuan'] is None and not rr['lines'])
bad('hash mismatch blocked',lambda:solve(s,'0'*64))
x=default_spec();x['assumptions']['n_minus_one']=True;bad('unsupported security extension rejected',lambda:normalize(x))
x=default_spec();x['nodes'][0]['load_mw']=float('nan');bad('NaN rejected',lambda:normalize(x))
x=default_spec();x['lines'][0]['id']='L23';bad('line identity mismatch rejected',lambda:normalize(x))
x=default_spec();x['generators'][0]['pmin_mw']=150;bad('reversed generator bounds rejected',lambda:normalize(x))
srv=create_server(0);t=threading.Thread(target=srv.serve_forever,daemon=True);t.start();base=f'http://127.0.0.1:{srv.server_port}'
try:
    token=json.load(urllib.request.urlopen(base+'/api/session'))['token']
    req=urllib.request.Request(base+'/api/demo/solve',data=b'{}',headers={'Content-Type':'application/json'})
    try:urllib.request.urlopen(req);raise AssertionError('token')
    except urllib.error.HTTPError as e:check('missing local session token rejected',e.code==403)
    report={'checks':checks,'mode':'Chromium offline-rendered production UI with test HTTP transport to real local solve API; storage and LLM response are test doubles, not a live model','browser_exceptions':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1040})
        page.set_default_timeout(6000)
        page.on('pageerror',lambda e:report['browser_exceptions'].append(str(e)))
        # Offline rendering; browser network/storage replaced ONLY in this test harness.
        # Every compile/solve request below is forwarded to the real local HTTP server.
        import re,base64
        upstream_calls=[]
        stub_enabled=[False]
        def transport(url, opts):
            path=str(url)
            if path=='/api/proxy' and stub_enabled[0]:
                body=json.loads(opts.get('body','{}'));upstream_calls.append(body)
                answer={'executable_spec':default_spec(),'missing_information':[],'unsupported_requirements':[], 'mapping_evidence':[{'field':'duration_hours','quote':'调度时长明确为1小时'}]}
                return {'status':200,'body':json.dumps({'choices':[{'message':{'content':json.dumps(answer,ensure_ascii=False)}}]},ensure_ascii=False)}
            if not path.startswith('/api/') or path.startswith('//'): raise ValueError('unexpected test network request')
            headers={k:v for k,v in (opts.get('headers') or {}).items() if k.lower() in ('content-type','x-dali-token')}
            headers['Origin']=base
            req=urllib.request.Request(base+path,data=opts['body'].encode() if opts.get('body') else None,method=opts.get('method') or 'GET',headers=headers)
            try:
                with urllib.request.urlopen(req,timeout=20) as r:return {'status':r.status,'body':r.read().decode()}
            except urllib.error.HTTPError as e:return {'status':e.code,'body':e.read().decode()}
        page.expose_function('testHTTP',transport)
        html=(ROOT/'index.html').read_text(encoding='utf-8')
        scripts=re.findall(r'<script src="([^"?]+)[^"]*"></script>',html)
        css=re.findall(r'<link rel="stylesheet" href="([^"?]+)[^"]*">',html)
        html=re.sub(r'<script src="[^"]+"></script>','',html)
        html=re.sub(r'<link rel="stylesheet"[^>]+>','',html)
        for name in ['pku','csg','huairou']:
            image=ROOT/f'assets/partners-official/{name}.png'
            html=html.replace(f'assets/partners-official/{name}.png','data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode())
        page.set_content(html)
        for name in css:page.add_style_tag(content=(ROOT/name).read_text())
        page.evaluate("""() => {const store={}; Object.defineProperty(window,'localStorage',{value:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]},toJSON:()=>store}});window.fetch=async(url,opt={})=>{const r=await window.testHTTP(String(url),{method:opt.method,headers:opt.headers,body:opt.body});return new Response(r.body,{status:r.status,headers:{'Content-Type':'application/json'}});};}""")
        for name in scripts+['demo-bridge.js']:page.add_script_tag(content=(ROOT/name).read_text())
        page.wait_for_selector('[data-demo-action=enter]')
        check('nine module navigation preserved',page.locator('#nav .nav').count()==9)
        page.locator('[data-demo-action=enter]').first.click()
        page.locator('#demo-prompt').wait_for();check('Chinese original prompt loaded','时长明确为1小时' in page.locator('#demo-prompt').input_value())
        page.locator('[data-demo-action=reference]').click()
        check('reference mode clearly labeled', '未调用LLM' in page.locator('#view').inner_text())
        page.locator('[data-demo-action=compile]').click()
        page.locator('[data-demo-action=approve]').wait_for()
        check('compiled all node equations', all(f'BAL-{i}' in page.locator('#view').inner_text() for i in range(1,5)))
        page.screenshot(path=str(ROOT/'artifacts/basic-demo/model.png'),full_page=True)
        page.locator('[data-demo-action=approve]').click()
        page.locator('[data-demo-page=solve]').last.click()
        page.locator('[data-demo-action=solve]').click()
        page.locator('[data-demo-action=export]').wait_for()
        check('browser reads real solver result',page.evaluate('DaliBasicDemo.state.result.objective_yuan')==55200)
        check('actual computation flag',page.evaluate('DaliBasicDemo.state.result.real_computation') is True)
        page.screenshot(path=str(ROOT/'artifacts/basic-demo/result.png'),full_page=True)
        page.locator('[data-demo-page=request]').first.click()
        page.locator('[data-demo-action=cap80]').click()
        check('new natural language invalidates result',page.evaluate('DaliBasicDemo.state.result===null'))
        page.locator('[data-demo-action=reference]').click();page.locator('[data-demo-action=compile]').click();page.locator('[data-demo-action=approve]').click();page.locator('[data-demo-page=solve]').last.click();page.locator('[data-demo-action=solve]').click();page.locator('[data-demo-action=export]').wait_for()
        check('browser capacity change real result',page.evaluate('DaliBasicDemo.state.result.objective_yuan')==55300)
        # Actual UI builds an API request; upstream is a disclosed test stub, not a real LLM.
        page.locator('[data-demo-page=request]').first.click();page.locator('[data-demo-action=base]').click()
        observed=upstream_calls
        stub_enabled[0]=True
        page.evaluate("DaliServices.save('primary',{baseUrl:'https://stub.invalid/v1',model:'isolated-test',apiKey:'test-only-not-real'})")
        page.locator('[data-demo-action=extract]').click();page.locator('#demo-spec').wait_for(state='attached')
        check('API payload includes current Chinese prompt',bool(observed) and '调度时长' in observed[0]['payload']['messages'][1]['content'])
        check('API route does not receive precomputed optimum','55200' not in json.dumps(observed))
        check('API origin distinct from reference',page.evaluate("DaliBasicDemo.state.origin.includes('模型API提取')"))
        check('API key absent from localStorage',not page.evaluate("JSON.stringify(localStorage).includes('test-only-not-real')"))
        page.locator('[data-demo-action=compile]').click();page.locator('[data-demo-action=approve]').click();page.locator('[data-demo-page=solve]').last.click();page.locator('[data-demo-action=solve]').click();page.locator('[data-demo-action=export]').wait_for()
        check('stub model parameters lead to real solve',page.evaluate('DaliBasicDemo.state.result.objective_yuan')==55200)
        check('main workspace unaffected',page.evaluate('DaliWorkflow.get().versions.length===0 && DaliWorkflow.get().data===null'))
        for width,height in [(1440,1040),(1024,900),(390,844)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(80)
            check(f'{width}px no horizontal page overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
        check('no uncaught browser exceptions',not report['browser_exceptions'])
        browser.close()
    report['status']='passed';report['check_count']=len(checks);report['base_result']=r
    (ROOT/'artifacts/basic-demo/validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'status':'passed','checks':len(checks)},ensure_ascii=False))
finally:srv.shutdown();srv.server_close();t.join(timeout=3)
