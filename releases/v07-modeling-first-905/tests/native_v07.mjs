import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.join(root,'artifacts','v07');fs.mkdirSync(out,{recursive:true});
const report={version:'0.7',scope:'Native Chrome / loopback HTTP / 905-node dataset',timestamp:new Date().toISOString(),checks:[],exceptions:[],screenshots:[],source_sha256:{},llm_calls:'isolated mock only'};
const sources=['index.html','theme.css','workspace.css','state.js','graphics.js','views.js','actions.js','engine.py','server.py','model_backend.py','data/case905.json','data/reference_result.json'];
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');for(const f of sources)report.source_sha256[f]=hash(f);
const check=(label,ok)=>{assert(ok,label);report.checks.push(label);console.log('PASS',label);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let server,child,ws,cdp,ev;const profile=path.join(out,'browser-'+Date.now());
try{
 server=spawn(process.env.PYTHON||'python',['-u','server.py','--port','0','--no-open'],{cwd:root,stdio:['ignore','pipe','pipe']});
 let errors='';server.stderr.on('data',c=>errors+=c);
 const base=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('server timeout '+errors)),15000);server.stdout.on('data',c=>{text+=c;const m=text.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('error',reject);});
 const browser=[process.env.TEST_BROWSER,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium'].find(p=>p&&fs.existsSync(p));assert(browser,'Chrome not found');
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const pf=path.join(profile,'DevToolsActivePort');for(let i=0;i<120&&!fs.existsSync(pf);i++)await sleep(100);assert(fs.existsSync(pf),'browser startup');
 const port=fs.readFileSync(pf,'utf8').split('\n')[0].trim(),targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});let seq=0;const waiting=new Map();
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')report.exceptions.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);if(waiting.has(r.id)){const o=waiting.get(r.id);clearTimeout(o.timer);waiting.delete(r.id);r.error?o.reject(Error(JSON.stringify(r.error))):o.resolve(r.result);}});
 cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout '+method));},90000);waiting.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,limit=500)=>{for(let i=0;i<limit;i++){if(await ev(expression))return;await sleep(70);}throw Error('UI timeout '+expression+' '+await ev('document.getElementById("toast").textContent'));};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const shot=async name=>{await ev('document.getElementById("toast").classList.remove("show")');await sleep(180);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));report.screenshots.push(name);};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:base});await wait('!!window.PA?.case && !!document.querySelector(".nav-item")');
 check('Exact platform title',await ev('document.title==="运行方式智能调整平台A"'));
 check('Unified case 905/237/1000',await ev('PA.case.buses.length===905&&PA.case.generators.length===237&&PA.case.branches.length===1000'));
 check('Raw quality counts preserved',await ev('JSON.stringify(PA.case.quality.slice(0,5).map(q=>q.count))==="[231,2,101,5,248]"'));
 check('Stable IDs and parallel edges',await ev('new Set(PA.case.branches.map(x=>x.id)).size===1000&&PA.case.counts.parallel_groups===67'));
 check('Angle radians / raw data unchanged',await ev('PA.case.angle_unit==="rad"&&PA.case.sha256==="85f724d78dfed663da29127f0da1b1cab71ace41e72c6e6cf6acea697d08509c"'));
 check('Seven workflow steps',await ev('document.querySelectorAll(".step").length===7'));
 check('Empty API settings',await ev('Object.values(PA.config).every(x=>!x.baseUrl)'));
 for(const[width,height]of[[1440,1080],[1366,950],[1024,950],[768,1000],[390,844]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const page of ['home','request','model','math','check','risk','solve','result','data']){await ev('PA.go('+JSON.stringify(page)+')');check(width+' '+page+' responsive',await ev('document.documentElement.scrollWidth<=innerWidth+2'));}
  check(width+' nine navigation modules',await ev('document.querySelectorAll(".nav-item").length===9'));
  check(width+' official logos loaded',await ev('[...document.querySelectorAll(".partner-board img")].length===3&&[...document.querySelectorAll(".partner-board img")].every(x=>x.complete&&x.naturalWidth>0)'));
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});await ev('PA.go("home")');await shot('home.png');
 check('905 topology circles',await ev('document.querySelectorAll("#network-svg .node").length===905'));
 check('1000 topology edges',await ev('document.querySelectorAll("#network-svg .edge").length===1000'));
 await ev('PA.go("request")');
 for(const level of ['L1','L2','L3','L4']){await click('[data-action=scenario][data-id=D905-'+level+']');await click('[data-action=analyze-rule]');await wait('!PA.state.busy&&PA.state.draft!==null');check(level+' automatic Chinese classification',await ev('PA.state.draft.level==='+JSON.stringify(level)));}
 check('L4 clarification requests present',await ev('PA.state.draft.missing_information.filter(x=>x.kind==="amplitude").length===2'));
 await click('[data-action=clarify][data-id=P1][data-option="1"]');await click('[data-action=clarify][data-id=P2][data-option="0"]');
 check('Clarifications update values without invented defaults',await ev('PA.state.draft.delta_pi[0].value===0.9&&PA.state.draft.delta_pi[1].value===0.95'));
 await click('[data-action=confirm-conditions]');await ev('PA.go("model")');
 check('Four Chinese level names visible',await ev('document.querySelectorAll(".level-option").length===4&&document.getElementById("view").textContent.includes("场景语义推理与模型结构扩展型建模")'));
 await ev('document.getElementById("zero-rate").value="unlimited";document.getElementById("b-convention").value="per_end";');
 await click('[data-action=compile-model]');await wait('!PA.state.busy&&PA.state.compiled!==null');
 check('Model specification structure',await ev('!!PA.state.compiled.spec.omega&&Array.isArray(PA.state.compiled.spec.delta_pi)&&!!PA.state.compiled.spec.s&&!!PA.state.compiled.spec.R'));
 check('Three pane formulation',await ev('document.querySelectorAll(".triple-model > .card").length===3'));
 await click('[data-action=approve-all]');await click('[data-action=confirm-version]');await wait('PA.state.confirmed');check('Version confirmed',await ev('PA.state.confirmed'));
 await shot('formulation.png');await ev('PA.go("check")');await click('[data-action=validate]');await wait('!PA.state.busy&&!!PA.state.report');
 check('Five validation layers',await ev('new Set(PA.state.report.rows.map(x=>x.layer)).size===5'));
 check('Raw violations still visible',await ev('PA.state.report.rows.some(x=>x.title==="电压高于上限"&&x.objects.length===231)'));
 await shot('validation.png');
 await ev('PA.go("risk")');await click('[data-action=assess-risk]');await wait('!PA.state.busy&&!!PA.state.risk');check('Risk simulation labelled',await ev('PA.state.risk.mode==="本地规则模拟"'));
 await click('[data-action=proposal-decision][data-id=R1][data-value=accept]');await click('[data-action=apply-risk]');await wait('!PA.state.busy&&PA.state.versions.length===2');
 check('Risk feedback creates new version and resets approval',await ev('PA.state.active==="V2"&&!PA.state.confirmed&&PA.state.draft.s.protected_branches.length===775'));
 await ev('PA.go("risk")');await shot('risk.png');
 await ev('PA.go("solve")');await click('[data-action=load-archive]');await wait('!PA.state.busy&&PA.state.result?.origin==="archive"');
 check('Archived result distinct from fresh compute',await ev('PA.state.result.origin==="archive"&&PA.state.result.series_mode==="synthetic_profile"'));
 check('16 periods / 905 voltages / 237 generator outputs',await ev('PA.state.result.periods.length===16&&PA.period().after.vm.length===905&&PA.period().after.pg.length===237'));
 check('L151 opened from archive',await ev('PA.period().open_branches[0]==="L151"'));
 await shot('results-topology.png');await ev('PA.go("result","matrix")');check('Switch matrix 16 periods',await ev('document.querySelectorAll(".matrix tbody tr").length===16'));await shot('switch-matrix.png');
 await ev('PA.go("result","generators")');check('Generator curve real values',await ev('!!document.querySelector(".chart-after")'));await shot('generators.png');
 await ev('PA.go("result","quality")');check('N1 denominator and criterion',await ev('PA.metrics().n1.total===106&&PA.metrics().n1.strict===0&&PA.metrics().n1.emergency===102'));await shot('quality.png');
 await ev('PA.go("result","geography")');check('Geographic features present',await ev('document.querySelectorAll(".region").length===12'));check('No fake geographic grid coordinates',await ev('document.querySelectorAll("#network-svg .node").length===0'));await shot('geography.png');
 await ev('PA.go("data","evaluation")');await click('[data-action=eval-scenarios]');await click('[data-action=run-evaluation]');await wait('!PA.state.busy&&!!PA.state.evalReport');check('Batch classification denominator',await ev('PA.state.evalReport.labelled===4&&PA.state.evalReport.rows.every(x=>x.correct)'));await shot('evaluation.png');
 await ev('PA.go("data","features")');check('All required capability statuses',await ev('new Set(PA.features.map(x=>x.status)).size===4&&PA.features.some(x=>x.name.includes("CMDP")&&x.status==="待开发")'));await shot('features.png');
 await ev('PA.go("request");document.getElementById("request-prompt").value="基于905节点直流OPF，将母线B3的有功负荷提高10%，保持模型结构不变。1个时段，每时段15分钟。"');await click('[data-action=analyze-rule]');await wait('!PA.state.busy&&PA.state.draft.omega.base_model==="DC-OPF"');await click('[data-action=confirm-conditions]');await ev('PA.go("model");document.getElementById("zero-rate").value="unlimited"');await click('[data-action=compile-model]');await wait('!PA.state.busy&&PA.state.page==="math"');await click('[data-action=approve-all]');await click('[data-action=confirm-version]');await ev('PA.go("check")');await click('[data-action=validate]');await wait('!PA.state.busy&&!!PA.state.report');check('Native DC precheck no blockers',await ev('PA.state.report.counts.block===0'));
 await click('[data-action=build-check]');await wait('!PA.state.busy&&!!PA.state.build');check('Actual Pyomo construction count matches',await ev('PA.state.build.variables===PA.state.compiled.scale.continuous&&PA.state.build.integer===0'));
  await ev('PA.go("solve")');check('Black-box-only solve UI',await ev('!document.body.textContent.includes("本机HiGHS")&&document.body.textContent.includes("独立求解服务")&&document.querySelectorAll("#view select").length>0'));check('Black-box submit remains available',await ev('document.querySelector("[data-action=solve]")!==null'));await shot('black-box-solver.png');


 await ev('PA.go("request")');await click('[data-action=scenario][data-id=D905-L1]');check('New request keeps archived result separate',await ev('PA.state.result?.origin==="archive"&&!PA.state.confirmed&&PA.state.compiled===null'));
 await ev('PA.go("data","services");PA.saveConfig("primary",{baseUrl:"https://mock.invalid/v1",path:"/chat/completions",model:"isolated-test",apiKey:"test-key-not-real"})');check('Keys excluded from browser storage',await ev('!JSON.stringify(localStorage).includes("test-key-not-real")'));
 await ev('PA.go("request");PA._realLLM=PA.llm;PA.llm=async()=>({schema_version:"2.0",case_id:"WRONG"});');await click('[data-action=analyze-api]');await wait('!PA.state.busy');check('Malformed model API response rejected',await ev('PA.state.compiled===null&&document.getElementById("toast").textContent.includes("不符合")'));await ev('PA.llm=PA._realLLM;PA.saveConfig("primary",{baseUrl:"",model:"",clearKey:true});');
 check('No browser exceptions',report.exceptions.length===0);
 for(const f of sources)check('Stable source '+f,hash(f)===report.source_sha256[f]);
 report.status='passed';report.check_count=report.checks.length;console.log('FINAL',report.status,report.check_count);
}catch(e){report.status='failed';report.error=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'native-validation.json'),JSON.stringify(report,null,2));try{ws?.close();}catch{}try{child?.kill();}catch{}try{server?.kill();}catch{}}
