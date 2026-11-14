// Browser navigates to the user's own loopback server. No paid API calls or optimization.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.cwd(),out=path.join(root,'artifacts','v05');fs.mkdirSync(out,{recursive:true});
const report={version:'0.5',scope:'本机Chrome/Edge通过实际HTTP加载自有网页；无模型API或求解',timestamp:new Date().toISOString(),checks:[],exceptions:[],screenshots:[],source_sha256:{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),check=(name,ok)=>{assert(ok,name);report.checks.push(name);console.log('PASS',name);};
const sources=['index.html','visual-map.js','visual-workflow.js','visualization.css','workflow-ui.js','workflow-core.js','workflow-io.js','serve.py'];
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');for(const f of sources)report.source_sha256[f]=sha(f);
const browser=[process.env.TEST_BROWSER,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','/usr/bin/chromium'].find(x=>x&&fs.existsSync(x));assert(browser,'Chrome/Edge not found');
let server,child,ws;const profile=path.join(out,'native-profile-'+Date.now());
try{
 server=spawn(process.env.PYTHON||'python',['-u','serve.py','--port','0','--no-open'],{cwd:root,stdio:['ignore','pipe','pipe']});
 const base=await new Promise((resolve,reject)=>{let s='';const t=setTimeout(()=>reject(Error('server start timeout')),10000);server.stdout.on('data',c=>{s+=c;const m=s.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(t);resolve(m[0]);}});server.on('error',reject);});
 check('自有HTTP服务已启动',!!base);
 child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);assert(fs.existsSync(portFile),'browser startup');
 const port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim(),targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 const pending=new Map();let seq=0;ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')report.exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let n=0;n<100;n++){if(await ev(expression))return;await sleep(60);}throw Error('UI timeout '+expression);};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const screenshot=async name=>{await ev('document.getElementById("toast")?.classList.remove("show")');await sleep(120);const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));report.screenshots.push(name);};
 await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Page.navigate',{url:base});await wait('!!window.DaliVisual && document.readyState==="complete"');
 check('实际HTTP加载V0.5入口与脚本',await ev('location.protocol==="http:" && !!DaliMapView && !!DaliVisual'));
 check('七类API地址均为空',await ev('Object.values(DaliServices.get()).every(x=>!x.baseUrl)'));
 for(const [width,height]of [[1440,1050],[1366,950],[1024,950],[768,1000],[390,844]]){
  await cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const page of ['home','request','model','math','check','risk','solve','result','data']){await ev('go('+JSON.stringify(page)+')');check(width+'px '+page+' 无横向溢出',await ev('document.documentElement.scrollWidth<=innerWidth+1'));}
  await ev('go("home")');check(width+'px 原九模块导航',await ev('document.querySelectorAll("#nav .nav").length===9'));
  check(width+'px 三家Logo完整加载',await ev('[...document.querySelectorAll(".partner-logo img")].every(i=>i.complete&&i.naturalWidth>0)'));
  if(width===1440)await screenshot('native-home.png');if(width===390)await screenshot('native-mobile.png');
 }
 await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await click('[data-viz-open="geography"]');check('完整地理图12区域',await ev('document.querySelectorAll("#vm-canvas .vm-region").length===12'));
 await screenshot('native-map.png');await click('[data-map-select="region:0"]');check('区域搜索列表可定位及查属性',await ev('document.querySelector("#vm-detail").textContent.includes("大理市")'));
 await click('[data-map-command="plus"]');check('地图缩放实际生效',await ev('DaliMapView.state.zoom>1'));
 await click('[data-map-command="reset"]');await click('[data-map-dataset="sample"]');
 check('独立拓扑样例4母线5支路',await ev('document.querySelectorAll("#vm-canvas .vm-bus").length===4&&document.querySelectorAll("#vm-canvas .vm-line-group").length===5'));
 check('地图样例不绑定业务数据',await ev('DaliWorkflow.get().data===null'));
 await click('[data-map-select="branch:L12"]');await screenshot('native-topology.png');
 await click('[data-map-layer="branches"]');check('关闭线路图层有效',await ev('document.querySelectorAll("#vm-canvas .vm-line-group").length===0'));await click('[data-map-layer="branches"]');
 await click('[data-viz-result="workflow"]');check('流程图位于结果分析子页',await ev('S.page==="result"&&document.querySelectorAll(".vf-flow-node").length===6'));
 await ev('DaliV4.loadCase("E3-L3");for(const c of DaliWorkflow.get().requirements.conditions)DaliWorkflow.updateCondition(c.id,c.text,c.source,true);DaliWorkflow.confirmRequirements();DaliWorkflow.acceptModel(DaliV4.demoModel(),"demo");DaliV4.ui.dirty=false;go("model")');
 check('当前模型结构及版本图可显示',await ev('document.querySelectorAll(".vf-version").length===1'));
 await screenshot('native-modeling.png');await ev('go("check")');await click('[data-action="run-checks"]');check('静态规则图表使用真实检查数',await ev('Number(document.querySelector(".vf-donut strong").textContent)===DaliWorkflow.get().reports[DaliWorkflow.get().active].checks.length'));
 await screenshot('native-validation.png');await ev('go("solve")');check('真实求解仍禁用',await ev('[...document.querySelectorAll("#view button")].some(x=>x.disabled&&x.textContent.includes("提交计算"))'));
 check('无浏览器未捕获异常',report.exceptions.length===0);for(const f of sources)check('源码保持一致 '+f,sha(f)===report.source_sha256[f]);
 report.status='passed';await cdp('Browser.close').catch(()=>{});
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e);}
finally{fs.writeFileSync(path.join(out,'native-validation.json'),JSON.stringify(report,null,2));ws?.close();if(child&&child.exitCode===null)child.kill();if(server&&server.exitCode===null)server.kill();await sleep(200);try{fs.rmSync(profile,{recursive:true,force:true});}catch{}console.log('FINAL',report.status,report.checks.length);}
