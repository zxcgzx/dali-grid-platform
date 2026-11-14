/* API调用适配层：不加载模型权重；不会在页面打开时调用任何服务。 */
(function () {
  'use strict';
  const STORAGE='dali-grid-api-v3';
  const memory={llm:'',risk:''};
  const defaults={llm:{baseUrl:'',model:'',chatPath:'/chat/completions',format:'json_object'},risk:{baseUrl:'',assessPath:'/api/risk/assess',healthPath:'/health'}};
  let saved={};
  try {saved=JSON.parse(localStorage.getItem(STORAGE)||'{}');} catch {}
  function pick(source, fields) {return Object.fromEntries(fields.map(k=>[k,typeof source?.[k]==='string'?source[k]:defaults[fields.includes('model')?'llm':'risk'][k]]));}
  let config={llm:pick(saved.llm,['baseUrl','model','chatPath','format']),risk:pick(saved.risk,['baseUrl','assessPath','healthPath'])};
  function get() {return {llm:{...config.llm,apiKeyConfigured:!!memory.llm},risk:{...config.risk,apiKeyConfigured:!!memory.risk}};}
  function save(next={}) {
    for(const section of ['llm','risk']) {
      const incoming=next[section];if(!incoming) continue;
      for(const key of Object.keys(defaults[section])) if(typeof incoming[key]==='string') config[section][key]=incoming[key].trim();
      // 空白密码框不清掉已配置密钥；清除需显式操作。
      if(typeof incoming.apiKey==='string' && incoming.apiKey.trim()) memory[section]=incoming.apiKey.trim();
      if(incoming.clearKey===true) memory[section]='';
    }
    try {localStorage.setItem(STORAGE,JSON.stringify(config));} catch { /* 隐私模式仍可使用当前会话。 */ }
    return get();
  }
  function endpoint(base, suffix) {
    if(!base) throw new Error('请先填写API服务地址');
    let u;try {u=new URL(base);} catch {throw new Error('API服务地址格式不正确');}
    if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash) throw new Error('请使用不含凭据、查询参数或片段的HTTP(S)地址');
    if(!suffix || /[?#]/.test(suffix) || /^\w+:/.test(suffix)||suffix.startsWith('//')||suffix.split('/').includes('..')) throw new Error('接口路径应为相对路径，例如 /chat/completions');
    return base.replace(/\/+$/,'')+'/'+suffix.replace(/^\/+/, '');
  }
  async function request(url,{method='GET',body,key='',timeout=120000}={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    const headers={Accept:'application/json'};
    if(body!==undefined) headers['Content-Type']='application/json';
    if(key) headers.Authorization='Bearer '+key;
    try {
      const r=await fetch(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,credentials:'omit',redirect:'error'});
      const raw=await r.text();
      if(!r.ok) throw new Error('服务返回 HTTP '+r.status+'，请检查接口地址、模型权限和调用额度');
      if(raw.length>1500000) throw new Error('服务响应过大');
      let result;try {result=JSON.parse(raw);} catch {throw new Error('API未返回有效JSON数据');}
      if(result?.error) throw new Error('API返回错误，请检查模型配置与服务端日志');
      return result;
    } catch(e) {
      if(e.name==='AbortError') throw new Error('请求超时，未获得模型结果');
      if(e instanceof TypeError) throw new Error('API连接失败，请检查网络、跨域设置或项目网关');
      throw e;
    } finally {clearTimeout(timer);}
  }
  const instructions=[
    '你是电力系统与运筹优化建模助手。请使用中文给出问题摘要、参数解释、变量说明、目标、约束、假设和代码注释；保留JSON字段名、变量符号、代码语法和标准缩写。',
    '仅返回一个符合提供的输出Schema的JSON对象，schema_version为1.0；所有必填分块都要存在。',
    '根据用户需求建立数学模型与对应代码，不得臆造缺失的设备参数、持续时间、代码执行结果和最优解。缺失信息写入missing_information。',
    '每项参数或结构修改记录source。只生成候选实现，不执行代码；validation四项一律pending。',
    '保持所选问题的体系：论文MATPOWER题目不擅自改为COPT；Python/COPT示例不声称是完整交流潮流模型。'
  ].join('\n');
  async function chat(payload,test=false) {
    const c=config.llm;
    if(!c.baseUrl||!c.model) throw new Error('请先填写API地址和模型标识');
    const body={model:c.model,stream:false,messages:test?
      [{role:'user',content:'连接测试。仅返回JSON对象 {"status":"ok"}。'}]:
      [{role:'system',content:instructions},{role:'user',content:JSON.stringify({...payload,output_schema:window.DaliContract?.schema||payload.output_schema})}]};
    if(test) body.max_tokens=32;
    if(c.format==='json_object') body.response_format={type:'json_object'};
    const r=await request(endpoint(c.baseUrl,c.chatPath),{method:'POST',body,key:memory.llm,timeout:test?30000:120000});
    if(!r?.choices?.[0]?.message?.content && !r?.output) throw new Error('响应缺少模型消息，请核对API协议');
    return r;
  }
  const unavailable=async()=>{throw new Error('该业务服务尚未配置');};
  window.DaliAPI={
    config:{get,save,storageKey:STORAGE},
    llm:{analyzeRequirement:p=>chat({task:'需求解析与建模',...p}),testConnection:()=>chat({},true)},
    modeling:{buildModel:p=>chat({task:'优化模型生成',...p}),validateModel:unavailable},
    topic2:{fetchTelemetry:unavailable},
    topic3:{assessRisk:p=>request(endpoint(config.risk.baseUrl,config.risk.assessPath),{method:'POST',body:p,key:memory.risk,timeout:60000}),testConnection:()=>request(endpoint(config.risk.baseUrl,config.risk.healthPath),{key:memory.risk,timeout:10000}),submitReward:unavailable},
    solver:{submit:unavailable,getTask:unavailable}
  };
})();
