// No paid API, LLM weights, generated-code execution or optimization. Real HTTP relay + browser tests.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),out=path.join(root,'artifacts','v05');fs.mkdirSync(out,{recursive:true});
const report={version:'0.5',timestamp:new Date().toISOString(),checks:[],screenshots:[],source_sha256:{},exceptions:[],scope:'Chromium内存文档渲染真实前端，浏览器fetch与存储采用测试替身；另以Node HTTP验证自有Python网关。未使用真实模型API，未求解。'};
const sourceFiles=['index.html','app.js','advanced.js','api-adapters.js','model-contract.js','research.css','branding.css','styles.css','workflow-core.js','services-v4.js','workflow-ui.js','workflow-io.js','workflow.css','serve.py','visual-map.js','visual-workflow.js','visualization.css','tests/visual-v05.mjs'];
const sha=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const f of sourceFiles)report.source_sha256[f]=sha(f);
const check=(name,ok)=>{assert(ok,name);report.checks.push(name);console.log('PASS',name);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=[process.env.TEST_BROWSER,'/usr/bin/chromium','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(x=>x&&fs.existsSync(x));assert(browser);
for(const f of ['workflow-core.js','services-v4.js','workflow-ui.js','workflow-io.js','model-contract.js','visual-map.js','visual-workflow.js']){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});check('JavaScript语法 '+f,r.status===0);}
let apiMode='normal',modelFixture=null,dataFixture=null;const calls=[];
const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;let body;try{body=JSON.parse(raw||'{}');}catch{res.writeHead(400).end();return;}calls.push({path:req.url,body});res.setHeader('Content-Type','application/json');
 const binding=p=>Object.fromEntries(['task_id','model_version','model_hash','requirements_revision','data_fingerprint'].map(k=>[k,p[k]]));
 if(req.url==='/chat/completions'){
  if(body.max_tokens===32){res.end(JSON.stringify({choices:[{message:{content:'{"status":"ok"}'}}]}));return;}
  const p=JSON.parse(body.messages.at(-1).content);
  if(apiMode==='http-error'){res.writeHead(500).end(JSON.stringify({error:'test'}));return;}
  if(apiMode==='slow')await sleep(700);
  if(p.task.includes('提取')){res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({conditions:[{text:p.natural_language,source:p.natural_language}],missing_information:['测试：补充数据版本']})}}]}));return;}
  const model=JSON.parse(JSON.stringify(modelFixture));model.model_meta.model_level=p.level||'L1';model.request_summary='测试桩返回，非真实模型服务';model.code.source='<img src=x onerror="window.__injected=1">';model.validation.physical='passed';
  if(apiMode==='wrong-level')model.model_meta.model_level=p.level==='L1'?'L4':'L1';
  if(apiMode==='bad-shape')delete model.objective;
  res.end(JSON.stringify({choices:[{message:{content:apiMode==='bad-json'?'not-json':JSON.stringify(model)}}]}));return;
 }
 if(req.url==='/review'){const p=JSON.parse(body.messages.at(-1).content);res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({...binding(p),report_id:'REVIEW-TEST',engine:'复核测试桩',findings:[{severity:'warning',message:'测试意见：核对条件来源',evidence:'测试桩对应R001'}]})}}]}));return;}
 if(req.url==='/validate'){res.end(JSON.stringify({...binding(body),report_id:'VALIDATE-TEST',engine:'专业服务测试桩',findings:[{severity:'info',message:'接口测试已完成，非物理证明',evidence:'测试桩'}]}));return;}
 if(req.url==='/snapshot'){res.end(JSON.stringify({data:dataFixture}));return;}
 if(req.url==='/risk'){res.end(JSON.stringify({...binding(body),risk_id:'RISK-TEST',risk_level:'测试桩等级，不作业务结论',findings:[{message:'测试：容量约束建议',evidence:'测试台账'}],recommended_changes:[{id:'R1',kind:'constraint',name:'容量边界候选项',expression:'|P_l| ≤ 80 MW',evidence:'测试数据，不是真实风险结果'},{id:'R2',kind:'objective',name:'不采纳的测试项',expression:'weight * risk',evidence:'测试项'}]}));return;}
 if(req.url==='/feedback'){res.end(JSON.stringify({...binding(body),receipt_id:'FEEDBACK-TEST'}));return;}
 res.writeHead(404).end(JSON.stringify({error:'not found'}));
});mock.listen(0,'127.0.0.1');await once(mock,'listening');const mockBase='http://127.0.0.1:'+mock.address().port;
const python=process.env.PYTHON||'python';let server,child,ws,base;const profile=path.join(out,'chromium-test-profile-'+Date.now());
try{
 server=spawn(python,['-u','serve.py','--port','0','--no-open','--allow-private-api'],{cwd:root,stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('gateway startup timeout')),10000);server.stdout.on('data',chunk=>{text+=chunk;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('error',reject);});
 check('自有网页网关启动',!!base);
 let r=await fetch(base+'/api/proxy',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});check('网关拒绝缺少会话令牌',r.status===403);
 r=await fetch(base+'/serve.py');check('网关不公开Python源码',r.status===403);
 r=await fetch(base+'/api/session',{headers:{Origin:'https://untrusted.invalid'}});check('网关拒绝跨站来源',r.status===403);
 child=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let n=0;n<100&&!fs.existsSync(portFile);n++)await sleep(70);assert(fs.existsSync(portFile),'chromium startup');const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const pending=new Map();let seq=0;ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expr=>{for(let n=0;n<120;n++){if(await ev(expr))return;await sleep(50);}console.error('DOMDEBUG',await ev('({url:location.href,ready:document.readyState,body:document.body?.innerText.slice(0,1000),scripts:[...document.scripts].map(s=>s.src),v4:typeof DaliV4})'));throw Error('UI timeout '+expr);};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const go=page=>ev('go('+JSON.stringify(page)+')');
 const capture=async(name,full=false)=>{await ev('document.getElementById("toast")?.classList.remove("show")');await sleep(100);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:full});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));report.screenshots.push(name);};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 // Render local user-owned artifacts in an in-memory document; no navigation or policy changes.
 const index=fs.readFileSync('index.html','utf8');const scripts=[...index.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1].split('?')[0]);
 let html=index.replace(/<script src="[^"]+"[^>]*><\/script>/g,'').replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,u)=>'<style>'+fs.readFileSync(u.split('?')[0],'utf8')+'</style>');
 html=html.replace(/src="(assets\/[^"?]+\.png)"/g,(_,u)=>'src="data:image/png;base64,'+fs.readFileSync(u).toString('base64')+'"');
 const frame=(await cdp('Page.getFrameTree')).frameTree.frame.id;await cdp('Page.setDocumentContent',{frameId:frame,html});
 await ev(`(()=>{const store={};const storage={getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v),removeItem:k=>delete store[k],clear:()=>Object.keys(store).forEach(k=>delete store[k]),toJSON:()=>store};Object.defineProperty(window,'localStorage',{value:storage});window.__wireCalls=[];window.__testMode='normal';window.__geo=${fs.readFileSync('assets/geography/dali-reference.geojson','utf8')};window.fetch=async(url,options={})=>{const respond=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});if(String(url).includes('dali-reference.geojson'))return respond(window.__geo);if(url==='/api/session')return respond({token:'test-token'});let env=JSON.parse(options.body||'{}');if(url==='/api/proxy'){url=env.url;options={...options,body:JSON.stringify(env.payload)}}const body=JSON.parse(options.body||'{}');window.__wireCalls.push({url:String(url),body});const bind=p=>Object.fromEntries(['task_id','model_version','model_hash','requirements_revision','data_fingerprint'].map(k=>[k,p[k]]));if(String(url).endsWith('/chat/completions')){if(body.max_tokens===32)return respond({choices:[{message:{content:'{"status":"ok"}'}}]});const p=JSON.parse(body.messages.at(-1).content);if(window.__testMode==='http-error')return respond({error:'test'},500);if(window.__testMode==='slow')await new Promise((resolve,reject)=>{const t=setTimeout(resolve,700);options.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'))},{once:true})});if(p.task.includes('提取'))return respond({choices:[{message:{content:JSON.stringify({conditions:[{text:p.natural_language,source:p.natural_language}],missing_information:['测试：补充数据版本']})}}]});const m=JSON.parse(JSON.stringify(window.__modelFixture));m.model_meta.model_level=p.level||'L1';m.request_summary='测试替身返回，非真实模型服务';m.code.source='<img src=x onerror="window.__injected=1">';m.validation.physical='passed';if(window.__testMode==='wrong-level')m.model_meta.model_level=p.level==='L1'?'L4':'L1';if(window.__testMode==='bad-shape')delete m.objective;return respond({choices:[{message:{content:window.__testMode==='bad-json'?'not-json':JSON.stringify(m)}}]});}if(String(url).endsWith('/review')){const p=JSON.parse(body.messages.at(-1).content);return respond({choices:[{message:{content:JSON.stringify({...bind(p),report_id:'REVIEW-TEST',engine:'复核测试替身',findings:[{severity:'warning',message:'测试意见：核对来源',evidence:'测试R001'}]})}}]});}if(String(url).endsWith('/validate'))return respond({...bind(body),report_id:'VALIDATE-TEST',engine:'专业接口测试替身',findings:[{severity:'info',message:'接口流程测试，非数学证明',evidence:'测试'}]});if(String(url).endsWith('/snapshot'))return respond({data:window.__dataFixture});if(String(url).endsWith('/risk'))return respond({...bind(body),risk_id:'RISK-TEST',risk_level:'测试等级，不作业务结论',findings:[{message:'测试容量建议',evidence:'测试'}],recommended_changes:[{id:'R1',kind:'constraint',name:'容量边界候选项',expression:'|P_l| ≤ 80 MW',evidence:'测试数据，不是真实风险结果'},{id:'R2',kind:'objective',name:'不采纳的测试项',expression:'weight * risk',evidence:'测试'}]});if(String(url).endsWith('/feedback'))return respond({...bind(body),receipt_id:'FEEDBACK-TEST'});return respond({error:'test route not found'},404);};})()`);
 for(const f of scripts)await ev(fs.readFileSync(f,'utf8')+'\n//# sourceURL='+f);
 await wait('!!window.DaliV4');
 check('初次加载不发送模型与业务API',await ev('window.__wireCalls.length===0'));
 check('七类接口地址均留空',await ev('Object.values(DaliServices.get()).length===7 && Object.values(DaliServices.get()).every(s=>s.baseUrl===""&&s.model==="")'));
 for(const [width,height]of [[1440,1000],[1366,900],[1024,900],[768,1024],[390,844]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const page of ['home','request','model','math','check','risk','solve','result','data']){await go(page);check(width+'px 页面无横向溢出 '+page,await ev('document.documentElement.scrollWidth<=innerWidth+1'));}
  await go('home');await ev('Promise.all([...document.images].map(i=>i.decode().catch(()=>null)))');check(width+'px 三家Logo加载且等比例',await ev('[...document.querySelectorAll(".partner-logo img")].length===3 && [...document.querySelectorAll(".partner-logo img")].every(i=>i.naturalWidth>0 && Math.abs(i.getBoundingClientRect().width/i.getBoundingClientRect().height-i.naturalWidth/i.naturalHeight)<.02)'));
  check(width+'px Logo一上两下',await ev('(()=>{const a=[...document.querySelectorAll(".partner-logo img")].map(e=>e.getBoundingClientRect());return a[0].bottom<=Math.min(a[1].top,a[2].top)+1 && a[1].left<a[2].left;})()'));
  if(width===1440)await capture('v05-home.png');if(width===390)await capture('v05-mobile.png');
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await go('model');check('四道中文论文题与完整中文层级',await ev('document.querySelectorAll(".case-card").length===4 && [...document.querySelectorAll(".level b")].every(e=>e.textContent.includes("建模"))'));
 await click('[data-case="E1-L1"]');check('题目载入条件确认页',await ev('S.page==="request" && DaliWorkflow.get().requirements.text.startsWith("请针对IEEE")'));
 await ev('try{DaliWorkflow.acceptModel(DaliV4.demoModel(),"demo")}catch(e){window.blocked=e.message}');check('未确认条件不能接受模型',await ev('!!window.blocked && DaliWorkflow.get().versions.length===0'));
 await ev('for(const c of [...DaliWorkflow.get().requirements.conditions]){document.querySelector("[data-action=confirm-condition][data-id="+c.id+"]").click()}');await click('[data-action="confirm-requirements"]');check('逐条确认后进入建模',await ev('S.page==="model" && DaliWorkflow.confirmed()'));
 await click('[data-action="load-demo"]');check('演示来源不冒充API',await ev('DaliWorkflow.current().origin==="demo" && document.querySelector("#view").innerText.includes("演示模板")'));
 modelFixture=await ev('window.__modelFixture=DaliV4.demoModel()');dataFixture=await ev('window.__dataFixture=DaliV4.sampleData()');
 await click('[data-action="review"][data-key="objective.expression"][data-decision="confirmed"]');check('逐项方程确认有记录',await ev('DaliWorkflow.reviewState(DaliWorkflow.elements().find(x=>x.key==="objective.expression"))==="confirmed"'));
 await click('[data-action="edit-item"][data-key="objective.expression"]');await ev('document.getElementById("edit-expression").value="C_gen(P_g) + delta"');await click('[data-action="save-item"]');check('人工修改创建新版本并重置确认',await ev('DaliWorkflow.get().versions.length===2 && DaliWorkflow.reviewState(DaliWorkflow.elements().find(x=>x.key==="objective.expression"))==="pending" && DaliWorkflow.current().origin==="demo_derived"'));
 check('版本差异可定位目标修改',await ev('DaliWorkflow.diff(DaliWorkflow.get().versions[0],DaliWorkflow.current()).some(d=>d.key==="objective.expression")'));
 await go('check');await click('[data-action="run-checks"]');check('静态检查产生真实规则报告',await ev('DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.length>=20'));
 check('物理验证与求解保持未执行',await ev('DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.filter(x=>["PHYSICS","EXEC"].includes(x.id)).every(x=>x.status==="not_run")'));
 check('待补充和占位代码被标记',await ev('DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.some(x=>x.id==="MISSING"&&x.status==="warn") && DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.some(x=>x.id==="CODE-TEXT"&&x.status==="warn")'));
 await capture('v05-validation.png');
 await ev('DaliWorkflow.review("objective.expression","confirmed")');check('审核变化使旧规则报告过期',await ev('!DaliWorkflow.reportCurrent(DaliWorkflow.get().reports[DaliWorkflow.get().active])'));
 check('重复母线和未知端点阻断',await ev('(()=>{const d=DaliV4.sampleData();d.buses.push({...d.buses[0]});d.branches[0].from="999";const r=DaliWorkflow.validateData(d);return r.errors.some(x=>x.includes("重复"))&&r.errors.some(x=>x.includes("端点"));})()'));
 check('CSV非数值不会变成null',await ev('(()=>{try{DaliV4.csv("id,pd\\n1,abc");return false}catch{return true}})()'));
 check('CSV引号字段可读取',await ev('DaliV4.csv('+JSON.stringify('id,name,pd\n1,"a,b",50')+')[0].name==="a,b"'));
 await go('data');await click('[data-action="sample-data"]');await click('[data-action="bind-data"]');check('绑定数据导致旧模型过期',await ev('DaliWorkflow.get().data.buses.length===4 && !DaliWorkflow.isFresh()'));
 await go('model');await click('[data-action="load-demo"]');check('新模型绑定当前数据版本',await ev('DaliWorkflow.isFresh()'));
 await ev('DaliServices.save("primary",{baseUrl:'+JSON.stringify(mockBase)+',model:"test-model",path:"/chat/completions",apiKey:"TEST-KEY-NOT-PERSIST",transport:"gateway"})');
 check('密钥不落入localStorage',await ev('!JSON.stringify(localStorage).includes("TEST-KEY-NOT-PERSIST") && DaliServices.get().primary.keyConfigured'));
 await ev('DaliServices.save("primary",{apiKey:""})');check('留空不清除会话密钥',await ev('DaliServices.get().primary.keyConfigured'));
 await ev('DaliServices.test("primary")');check('连接测试前端构造最小模型请求',await ev('window.__wireCalls.some(x=>x.body.max_tokens===32)'));
 await go('model');await click('[data-action="build"]');await wait('!DaliV4.ui.busy');check('API返回进入结构化方程工作区',await ev('S.page==="math" && DaliWorkflow.current().origin==="api"'));
 check('API自报物理通过重置为待验证',await ev('DaliWorkflow.current().model.validation.physical==="pending"'));
 check('代码中的HTML不执行',await ev('!window.__injected && !document.querySelector("#view img[src=x]") && document.querySelector("#view").innerText.includes("onerror")'));
 const sent=await ev('window.__wireCalls.filter(x=>x.url.endsWith("/chat/completions")&&!x.body.max_tokens).at(-1)');const sentPayload=JSON.parse(sent.body.messages.at(-1).content);
 check('确认条件与完整模型契约送入API',sentPayload.requirements.conditions.every(c=>c.confirmed)&&sentPayload.output_schema.properties.objective&&sentPayload.natural_language.includes('母线'));
 check('数据默认不外发',sentPayload.data===null&&sentPayload.data_included===false);
 for(const mode of ['wrong-level','bad-json','bad-shape','http-error']){apiMode=mode;await ev('window.__testMode='+JSON.stringify(mode));const n=await ev('DaliWorkflow.get().versions.length');await go('model');await click('[data-action="build"]');await wait('!DaliV4.ui.busy');check('异常API响应不接受 '+mode,await ev('DaliWorkflow.get().versions.length')===n);}
 apiMode='slow';await ev('window.__testMode="slow"');await go('model');const before=await ev('DaliWorkflow.get().versions.length');await click('[data-action="build"]');await go('request');await ev('document.getElementById("req-text").value+="修改";document.getElementById("req-text").dispatchEvent(new Event("input",{bubbles:true}))');await sleep(900);check('输入改变后旧响应不覆盖',await ev('DaliWorkflow.get().versions.length')===before);apiMode='normal';await ev('window.__testMode="normal"');
 // Establish a fresh confirmed task for topic2 and risk tests.
 await ev('DaliV4.ui.dirty=false;DaliWorkflow.setRequirements("建立中文建模草案", "L1");for(const c of DaliWorkflow.get().requirements.conditions)DaliWorkflow.updateCondition(c.id,c.text,c.source,true);DaliWorkflow.confirmRequirements();DaliWorkflow.acceptModel(DaliV4.demoModel(),"demo");');
 for(const [id,urlPath]of [['topic2Model','/chat/completions'],['topic2Data','/snapshot'],['reviewer','/review'],['validator','/validate'],['risk','/risk'],['reward','/feedback']])await ev('DaliServices.save('+JSON.stringify(id)+',{baseUrl:'+JSON.stringify(mockBase)+',path:'+JSON.stringify(urlPath)+',model:"test-model",transport:"gateway"})');
 await go('data');await click('[data-action="fetch-topic2"]');await wait('document.getElementById("data-text").value.includes("DEMO4-REFERENCE")');check('课题2数据只进入预览编辑区',await ev('window.__wireCalls.some(c=>c.url.endsWith("/snapshot"))'));
 await go('check');await click('[data-action="external-review"]');await wait('(DaliWorkflow.get().external_reports[DaliWorkflow.get().active]||[]).length===1');check('复核模型建议按任务版本接入',await ev('DaliWorkflow.get().external_reports[DaliWorkflow.get().active][0].kind==="模型复核建议"'));
 await click('[data-action="external-validator"]');await wait('(DaliWorkflow.get().external_reports[DaliWorkflow.get().active]||[]).length===2');check('独立专业接口与复核模型分开',await ev('DaliWorkflow.get().external_reports[DaliWorkflow.get().active][1].kind.includes("专业")'));
 check('跨版本报告被拒绝',await ev('(()=>{try{DaliWorkflow.acceptExternal({...DaliWorkflow.binding(),model_version:"wrong",report_id:"X",engine:"X",findings:[]},"test");return false}catch{return true}})()'));
 const session=await(await fetch(base+'/api/session')).json();
 const realPost=async(route,data)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Dali-Token':session.token},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
 const b=await ev('DaliWorkflow.binding()');
 const ast=(await realPost('/api/check-code',{...b,language:'Python',source:'raise RuntimeError("MUST_NOT_EXECUTE")'})).body;check('实际Python语法服务不执行代码',ast.syntax==='passed'&&ast.execution==='not_run');
 const badAst=(await realPost('/api/check-code',{...b,language:'Python',source:'def f(: pass'})).body;check('实际Python语法错误有证据',badAst.syntax==='failed');
 const matlab=(await realPost('/api/check-code',{...b,language:'MATLAB',source:'disp(1)'})).body;check('未配置MATLAB解析器不伪报通过',matlab.syntax==='not_run');
 const actualChat=(await realPost('/api/proxy',{service:'primary',url:mockBase+'/chat/completions',method:'POST',payload:{model:'stub',max_tokens:32,messages:[]},api_key:'test-only'}));check('实际HTTP网关转发模型最小请求',actualChat.status===200&&calls.some(c=>c.body.max_tokens===32));
 const actualRisk=(await realPost('/api/proxy',{service:'risk',url:mockBase+'/risk',method:'POST',payload:b}));check('实际HTTP风险转发保留模型绑定',actualRisk.status===200&&actualRisk.body.model_version===b.model_version);
 const actualFeedback=(await realPost('/api/proxy',{service:'reward',url:mockBase+'/feedback',method:'POST',payload:b}));check('实际HTTP反馈返回回执',actualFeedback.status===200&&actualFeedback.body.receipt_id==='FEEDBACK-TEST');
 await go('risk');await click('[data-action="risk-assess"]');await wait('!!DaliWorkflow.get().risk');check('风险结果与当前模型严格绑定',await ev('DaliWorkflow.get().risk.risk_id==="RISK-TEST"'));
 await click('[data-action="decide-risk"][data-id="R1"][data-decision="accept"]');await click('[data-action="decide-risk"][data-id="R2"][data-decision="reject"]');
 await capture('v05-risk.png');await click('[data-action="apply-risk"]');check('风险意见进入新版本而非直接求解',await ev('DaliWorkflow.current().model.constraints.some(c=>c.name==="容量边界候选项") && !DaliWorkflow.current().model.objective.terms.some(c=>c.name==="不采纳的测试项") && DaliWorkflow.get().risk_history.length===1'));
 check('风险修改后需要同步代码与重新确认',await ev('DaliWorkflow.current().model.missing_information.some(x=>x.includes("同步")) && DaliWorkflow.elements().every(e=>DaliWorkflow.reviewState(e)==="pending")'));
 check('缺省Reward权重不得自动通过',await ev('(()=>{try{DaliWorkflow.setReward([],true);return false}catch{return true}})()'));
 await ev('DaliWorkflow.setReward([{name:"风险",metric:"r",weight:1,direction:"minimize",normalization:"测试服务给定0到1范围"}],true)');await go('risk');await click('[data-action="send-feedback"]');await wait('!!document.getElementById("v4-modal")');check('奖励协商收到匹配回执',await ev('document.getElementById("v4-modal").innerText.includes("FEEDBACK-TEST")'));await click('[data-action="close-modal"]');
 const handoff=await ev('DaliWorkflow.handoff()');check('交接包包含模型/条件/审核/风险历史且不标记求解',!!handoff.model&&!!handoff.requirements&&handoff.risk_history.length===1&&handoff.readiness.solver_executed===false);
 await go('solve');check('求解只留黑箱选择及禁用提交',await ev('[...document.getElementById("solver-choice").options].map(x=>x.text).includes("IPOPT") && [...document.querySelectorAll("#view button")].some(x=>x.disabled&&x.textContent.includes("提交计算"))'));
 check('不存在求解器技术长说明',await ev('!document.querySelector("#view").innerText.includes("IPOPT本身不是")'));
 // Map and stage visualizations use only current records; no optimization is performed.
 await go('result');await wait('document.querySelectorAll("#vm-canvas .vm-region").length===12');
 check('原九模块导航名称与顺序不变',await ev('JSON.stringify([...document.querySelectorAll("#nav .nav")].map(n=>n.querySelector("span:last-of-type").textContent)) === JSON.stringify(["工作台","需求理解","动态建模","数学模型","模型校验","风险评估","优化求解","结果分析","数据与模型"])'));
 check('地图与流程归入结果分析的四个子页',await ev('document.querySelectorAll("[data-viz-result]").length===4 && document.querySelectorAll("#nav .nav").length===9'));
 check('地图离线显示12个参考区域',await ev('document.querySelectorAll("#vm-canvas .vm-region").length===12'));
 check('无真实坐标不伪造地理设备',await ev('document.querySelectorAll("#vm-canvas .vm-bus").length===0'));
 await capture('v05-map.png');
 const taskBeforeMap=await ev('JSON.stringify(DaliWorkflow.exportState())');const reqBeforeMap=await ev('window.__wireCalls.length');
 await click('[data-map-select="region:0"]');
 check('区域点击展示属性',await ev('document.querySelector("#vm-detail").innerText.includes("大理市") && document.querySelector("#vm-canvas .vm-region.selected")'));
 await click('[data-map-command="plus"]');check('地图缩放响应',await ev('DaliMapView.state.zoom>1'));
 await click('[data-map-command="reset"]');check('地图复位恢复视域',await ev('DaliMapView.state.zoom===1 && DaliMapView.state.offset.every(x=>x===0)'));
 await ev('document.querySelector("#vm-query").value="剑川";document.querySelector("#vm-query").dispatchEvent(new Event("input",{bubbles:true}))');
 check('按中文名称搜索地图对象',await ev('document.querySelectorAll("#vm-catalog-list .vm-object").length===1 && document.querySelector("#vm-catalog-list").textContent.includes("剑川县")'));
 await click('[data-map-dataset="sample"]');
 check('独立四节点样例有4母线5支路2机组',await ev('document.querySelectorAll("#vm-canvas .vm-bus").length===4 && document.querySelectorAll("#vm-canvas .vm-line-group").length===5 && document.querySelectorAll("#vm-canvas .vm-generator").length===2'));
 check('样例未知开关状态以未知显示',await ev('document.querySelectorAll("#vm-canvas .vm-line-group.unknown").length===5'));
 check('样例明确标识未绑定任务',await ev('document.querySelector("#vm-warning").textContent.includes("未绑定当前任务")'));
 await click('[data-map-select="branch:L12"]');check('支路属性包含端点与输入容量',await ev('document.querySelector("#vm-detail").innerText.includes("1 → 2") && document.querySelector("#vm-detail").innerText.includes("50 MW")'));
 await click('[data-map-layer="branches"]');check('支路图层可以关闭',await ev('document.querySelectorAll("#vm-canvas .vm-line-group").length===0'));
 await click('[data-map-layer="branches"]');
 await ev('document.querySelector("#vm-status").value="on";document.querySelector("#vm-status").dispatchEvent(new Event("change",{bubbles:true}))');check('只看在役时不伪造样例在役线路',await ev('document.querySelectorAll("#vm-canvas .vm-line-group").length===0'));
 await ev('document.querySelector("#vm-status").value="all";document.querySelector("#vm-status").dispatchEvent(new Event("change",{bubbles:true}))');
 await capture('v05-topology.png');
 await click('[data-map-command="expand"]');check('大图模式不新增导航',await ev('!!document.querySelector(".vm-expanded") && document.querySelectorAll("#nav .nav").length===9'));
 await ev('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');check('Escape退出大图',await ev('!document.querySelector(".vm-expanded")'));
 check('地图浏览不改变当前任务数据与模型',await ev('JSON.stringify(DaliWorkflow.exportState())')===taskBeforeMap);
 check('地图操作不调用API',await ev('window.__wireCalls.length')===reqBeforeMap);
 check('拒绝非法地理经纬度',await ev('(()=>{try{DaliMapView.validateGeo({type:"FeatureCollection",features:[{geometry:{type:"Polygon",coordinates:[[[181,25],[101,25],[101,26],[181,25]]]}}]});return false}catch{return true}})()'));
 await click('[data-viz-result="workflow"]');check('流程总览含6环节及回退路径',await ev('document.querySelectorAll(".vf-flow-node").length===6 && document.querySelector(".vf-flow-feedback").innerText.includes("模型修订")'));
 await capture('v05-flow.png');
 await click('[data-viz-result="history"]');check('过程记录由真实事件构成',await ev('document.querySelectorAll(".vf-event").length===DaliWorkflow.get().audit.length'));
 const replayBefore=await ev('JSON.stringify(DaliWorkflow.exportState())');await click('[data-viz-replay="next"]');check('事件时间轴可定位记录',await ev('DaliVisual.V.replayIndex===1'));
 await click('[data-viz-replay="play"]');await sleep(1350);await click('[data-viz-replay="play"]');check('自动回放可暂停',await ev('DaliVisual.V.replayIndex>=2 && DaliVisual.V.replayTimer===null'));
 check('事件回放不重复执行任务',await ev('JSON.stringify(DaliWorkflow.exportState())')===replayBefore);
 await go('request');check('需求理解含实际条件计数',await ev('document.querySelector(".vf-stage-panel").innerText.includes("需求解析与确认") && DaliVisual.snapshot().conditionConfirmed === DaliWorkflow.get().requirements.conditions.filter(c=>c.confirmed).length'));
 await go('model');check('动态建模含真实版本谱系',await ev('document.querySelectorAll(".vf-version").length===Math.min(8,DaliWorkflow.get().versions.length)'));
 await go('math');await ev('DaliWorkflow.mapCondition(DaliWorkflow.get().requirements.conditions[0].id,["objective.expression"]);DaliV4.draw()');check('人工关联后关系图出现真实连线',await ev('document.querySelectorAll(".vf-link").length>=1'));
 await ev('document.querySelector(".vf-coverage-detail").open=true');await ev('document.querySelector("[data-viz-condition]").dispatchEvent(new MouseEvent("click",{bubbles:true}))');check('关联图点击可追溯到原文',await ev('document.getElementById("v4-modal").innerText.includes("条件关联")'));await click('[data-action="close-modal"]');
 await go('check');await click('[data-action="run-checks"]');check('校验分布使用实际规则数量',await ev('Number(document.querySelector(".vf-donut strong").textContent)===DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.length'));
 await click('[data-viz-issue="warn"]');check('校验分类筛选真实规则',await ev('[...document.querySelectorAll(".rule-card")].every(c=>c.hidden===!c.classList.contains("warn"))'));await click('[data-viz-issue="all"]');
 await capture('v05-validation.png');await go('risk');check('风险协同图显示实际建议统计',await ev('document.querySelectorAll(".vf-risk-path>div").length===4'));
 await go('data');check('数据接入图显示绑定版本',await ev('document.querySelector(".vf-data-chain").innerText.includes(DaliWorkflow.get().data.data_version)'));
 await go('home');check('首页地图入口与九模块概览保留',await ev('!!document.querySelector(".vf-map-preview") && document.querySelectorAll(".vf-module-links button").length===6'));
 const storedReport=await ev('DaliWorkflow.get().reports[DaliWorkflow.get().active]');await ev('DaliWorkflow.invalidateRequirement();DaliV4.draw()');check('输入确认失效后流程图同步过期',await ev('DaliVisual.stages().find(x=>x.page==="model").state==="stale" && DaliVisual.stages().find(x=>x.page==="check").state==="stale"'));
 // Coordinates are test-only fixtures, not shipped as actual device locations.
 const mapOriginalData=await ev('DaliWorkflow.clone(DaliWorkflow.get().data)');
 await ev('(()=>{const d=DaliV4.sampleData();d.coordinate_system="GCJ-02";d.buses.forEach((b,i)=>{b.lon=100.15+i*.05;b.lat=25.65+i*.03});d.branches[0].status=1;d.branches[1].status=0;DaliWorkflow.setData(d);DaliMapView.state.dataset="current";DaliVisual.setResultTab("geography")})()');
 check('同坐标系输入可叠加母线和支路',await ev('document.querySelectorAll("#vm-canvas .vm-bus").length===4 && document.querySelectorAll("#vm-canvas .vm-line-group").length===5'));
 check('在役停运未知使用不同样式',await ev('document.querySelectorAll("#vm-canvas .vm-line-group.on").length===1 && document.querySelectorAll("#vm-canvas .vm-line-group.off").length===1 && document.querySelectorAll("#vm-canvas .vm-line-group.unknown").length===3'));
 await ev('(()=>{const d=DaliWorkflow.clone(DaliWorkflow.get().data);d.coordinate_system="WGS84";DaliWorkflow.setData(d);DaliV4.draw()})()');
 check('坐标系不一致时不自动叠加',await ev('document.querySelectorAll("#vm-canvas .vm-bus").length===0 && document.querySelector("#vm-warning").innerText.includes("未匹配")'));
 await ev('DaliWorkflow.setData('+JSON.stringify(mapOriginalData)+')');
 for(const name of ['index.html','visual-map.js','visual-workflow.js','visualization.css','assets/geography/dali-reference.geojson']){const response=await fetch(base+'/'+name);check('实际HTTP资源可读 '+name,response.ok&&(await response.text()).length>100);}
 await ev('DaliWorkflow.saveLocal();DaliWorkflow.restoreLocal()');check('恢复不沿用未核实的审批结论',await ev('!DaliWorkflow.confirmed() && Object.keys(DaliWorkflow.get().reports).length===0 && DaliWorkflow.get().risk===null'));
 check('恶意工作包字段拒绝',await ev('(()=>{try{DaliWorkflow.parseJSON("{\\"__proto__\\":{}}");return false}catch{return true}})()'));
 // Clean screenshots with visible demo origin, not mock API data.
 await ev('DaliWorkflow.reset();DaliV4.loadCase("E3-L3");for(const c of DaliWorkflow.get().requirements.conditions)DaliWorkflow.updateCondition(c.id,c.text,c.source,true);DaliWorkflow.confirmRequirements();DaliWorkflow.acceptModel(DaliV4.demoModel(),"demo");DaliV4.ui.dirty=false;');
 await go('home');await capture('v05-home.png');await go('model');await capture('v05-modeling.png');await go('math');await click('[data-action="output-tab"][data-tab="equations"]');await capture('v05-equations.png');await go('request');await capture('v05-requirements.png');await go('risk');await capture('v05-risk.png');
 check('无求解器和本地推理依赖',!fs.readFileSync('serve.py','utf8').includes('import torch'));
 check('无未捕获的浏览器异常',report.exceptions.length===0);
 check('从未调用真实求解接口',calls.every(x=>!x.path.includes('solve')));
 for(const f of sourceFiles)check('最终验证源未变化 '+f,sha(f)===report.source_sha256[f]);
 report.status='passed';report.request_counts={model:calls.filter(c=>c.path.includes('chat')).length,risk:calls.filter(c=>c.path==='/risk').length,all:calls.length};
 await cdp('Browser.close').catch(()=>{});
}catch(e){report.status='failed';report.error=String(e);console.error(e);process.exitCode=1;}
finally{fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));ws?.close();if(child&&child.exitCode===null)child.kill();if(server&&server.exitCode===null)server.kill();mock.closeAllConnections();await new Promise(r=>mock.close(r));await sleep(150);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}console.log('FINAL',report.status,report.checks.length);}
