// Actual HTTP page and local numerical solver; no external LLM calls or response stubs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(), out=path.join(root,'artifacts','platform-a');
fs.mkdirSync(out,{recursive:true});
const NAME='运行方式智能调整平台A';
const report={title:NAME,version:'0.5.1-A',timestamp:new Date().toISOString(),scope:'本机Chrome实际HTTP加载，参考参数路径触发真实SciPy/HiGHS计算；未调用LLM API',checks:[],exceptions:[],screenshots:[],runs:[],source_sha256:{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=(name,ok)=>{assert(ok,name);report.checks.push(name);console.log('PASS',name);};
const sources=['index.html','platform-a.css','app.js','model-contract.js','visual-workflow.js','serve_demo.py','demo-bridge.js','demo_solver.py','serve.py','启动平台.bat','启动完整示例.bat','tests/platform-a-native.mjs'];
const sha=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
for(const f of sources)report.source_sha256[f]=sha(f);
const browser=[process.env.TEST_BROWSER,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(x=>x&&fs.existsSync(x));
assert(browser,'Chrome/Edge not found');
const preferred=path.join(process.env.LOCALAPPDATA||'','Programs','Python','Python311','python.exe');
const python=process.env.PYTHON||(fs.existsSync(preferred)?preferred:'python');
report.browser=browser;report.python=python;
let server,child,ws;const profile=path.join(out,'isolated-profile-'+Date.now());
try{
 server=spawn(python,['-X','utf8','-u','serve_demo.py','--port','0','--no-open'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const base=await new Promise((resolve,reject)=>{let text='',err='';const timer=setTimeout(()=>reject(Error('HTTP startup timeout: '+err)),12000);server.stdout.on('data',c=>{text+=c;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.stderr.on('data',c=>err+=c);server.on('error',e=>{clearTimeout(timer);reject(e);});server.on('exit',code=>{if(code!==null&&code!==0){clearTimeout(timer);reject(Error('server exit '+code+': '+err));}});});
 check('真实四节点HTTP服务启动',!!base);
 const info=await(await fetch(base+'/api/demo/info')).json();
 check('本地接口提供完整中文需求及执行规格',info.prompt.includes('时长明确为1小时')&&info.spec.nodes.length===4&&info.spec.lines.length===5);
 const denied=await fetch(base+'/api/demo/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 check('求解接口拒绝缺失会话令牌',denied.status===403);
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');
 for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
 assert(fs.existsSync(portFile),'browser startup failed');
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();
 const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let seq=0;const pending=new Map();
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let n=0;n<200;n++){if(await ev(expression))return;await sleep(60);}throw Error('UI timeout '+expression);};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const shot=async name=>{await ev('document.getElementById("toast")?.classList.remove("show"); window.scrollTo(0,0)');await sleep(150);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));report.screenshots.push(name);};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:base});
 await wait('!!window.DaliBasicDemo && document.readyState==="complete"');
 check('新计算示例脚本通过HTTP自动加载',await ev('!!DaliBasicDemo && location.protocol==="http:"'));
 check('浏览器标题为精确新名称',await ev('document.title')===NAME);
 check('左上角平台名称已统一',await ev('document.querySelector(".platform-brand strong").textContent')===NAME);
 check('页脚与面包屑已统一且无旧平台前缀',await ev('document.querySelector("footer").textContent.startsWith('+JSON.stringify(NAME)+') && document.querySelector(".breadcrumb").textContent.startsWith('+JSON.stringify(NAME)+') && !document.querySelector(".brand-area").textContent.includes("大理电网")'));
 check('API地址仍为空且未代填密钥',await ev('Object.values(DaliServices.get()).every(x=>!x.baseUrl&&!x.keyConfigured)'));
 for(const [width,height]of [[1440,1050],[1366,950],[1024,950],[768,1000],[390,844]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const page of ['home','request','model','math','check','risk','solve','result','data']){
   await ev('go('+JSON.stringify(page)+')');
   check(width+'px '+page+' 无横向溢出',await ev('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  check(width+'px 原九模块保留',await ev('document.querySelectorAll("#nav .nav").length===9'));
  check(width+'px 三家Logo加载完毕',await ev('[...document.querySelectorAll(".partner-logo img")].every(i=>i.complete&&i.naturalWidth>0)'));
  check(width+'px 平台长标题不超出侧栏',await ev('(()=>{const a=document.querySelector(".platform-brand strong").getBoundingClientRect(),b=document.querySelector(".sidebar").getBoundingClientRect();return a.right<=b.right&&a.left>=b.left;})()'));
  await ev('go("home")');
  if(width===1440)await shot('platform-a-home.png');
  if(width===390)await shot('platform-a-mobile.png');
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await click('[data-viz-open="geography"]');
 check('地理参考图保留12个区域',await ev('document.querySelectorAll("#vm-canvas .vm-region").length===12'));
 await ev('go("home")');await click('[data-demo-action="enter"]');await wait('!!document.querySelector("#demo-prompt")');
 check('中文需求从本机接口载入',await ev('document.querySelector("#demo-prompt").value.includes("时长明确为1小时")'));
 async function runUI(label,expected){
  await click('[data-demo-action="reference"]');await wait('!!document.querySelector("[data-demo-action=compile]")');
  check(label+' 参考参数来源明确标记',await ev('DaliBasicDemo.state.origin.includes("未调用LLM")'));
  await click('[data-demo-action="compile"]');await wait('!!document.querySelector("[data-demo-action=approve]") && !DaliBasicDemo.state.busy');
  check(label+' 四个节点平衡方程实际生成',await ev('[1,2,3,4].every(i=>document.getElementById("view").textContent.includes("BAL-"+i))'));
  await click('[data-demo-action="approve"]');await click('[data-demo-page="solve"]');
  await click('[data-demo-action="solve"]');await wait('!!DaliBasicDemo.state.result && !DaliBasicDemo.state.busy');
  const r=await ev('JSON.parse(JSON.stringify(DaliBasicDemo.state.result))');
  check(label+' 网页返回真实最优值 '+expected,r.real_computation===true&&r.status==='optimal'&&Math.abs(r.objective_yuan-expected)<1e-6);
  check(label+' 独立数值复核通过',r.checks.numerically_feasible_for_this_model===true);
  report.runs.push(r);
 }
 await runUI('基准',55200);await shot('platform-a-result.png');
 await click('[data-demo-page="request"]');await click('[data-demo-action="load80"]');
 check('修改需求使旧结果失效',await ev('DaliBasicDemo.state.result===null && DaliBasicDemo.state.compiled===null'));
 await runUI('负荷变更',45200);
 await click('[data-demo-page="request"]');await click('[data-demo-action="cap80"]');await runUI('容量变更',55300);
 check('容量变更产生新的开关方案',JSON.stringify(report.runs[2].lines.map(x=>x.on))===JSON.stringify([1,1,1,1,0]));
 check('贯通示例未覆盖主工作包',await ev('DaliWorkflow.get().versions.length===0 && DaliWorkflow.get().data===null'));
 const token=(await(await fetch(base+'/api/session')).json()).token;
 const post=async(url,body)=>{const r=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json','X-Dali-Token':token},body:JSON.stringify(body)});return {http:r.status,data:await r.json()};};
 const bad=await post('/api/demo/solve',{spec:info.spec,expected_spec_sha256:'0'.repeat(64)});
 check('接口拒绝错误规格指纹',bad.http===400);
 const overloaded=structuredClone(info.spec);overloaded.nodes[3].load_mw=250;
 const m=await post('/api/demo/compile',{spec:overloaded});assert(m.http===200);
 const fail=await post('/api/demo/solve',{spec:overloaded,expected_spec_sha256:m.data.spec_sha256});
 check('不可行场景不返回假目标值或旧方案',fail.http===200&&fail.data.status==='infeasible'&&fail.data.objective_yuan===null&&fail.data.lines.length===0);
 report.infeasible_run=fail.data;
 check('无浏览器未捕获异常',report.exceptions.length===0);
 for(const f of sources)check('验证期间文件不变 '+f,sha(f)===report.source_sha256[f]);
 report.status='passed';report.check_count=report.checks.length;
 await cdp('Browser.close').catch(()=>{});
}catch(e){report.status='failed';report.error=String(e);report.check_count=report.checks.length;process.exitCode=1;console.error(e);}
finally{
 fs.writeFileSync(path.join(out,'native-validation.json'),JSON.stringify(report,null,2));
 ws?.close();if(child&&child.exitCode===null)child.kill();if(server&&server.exitCode===null)server.kill();
 await sleep(300);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}
 console.log('FINAL',report.status,report.check_count);
}
