/* ProOPF-B中文评测题、远程模型API配置、结构化模型输出与风险服务接口。 */
(function () {
  const LEVELS = {
    L1: {name:"显式参数修改型建模", desc:"根据明确给定的设备、参数及数值要求，完成基础优化模型的参数化修改。"},
    L2: {name:"场景语义参数推理型建模", desc:"从运行场景理解设备与参数变化方向，将自然语言转化为可确认的模型参数。"},
    L3: {name:"模型结构扩展型建模", desc:"在基础模型上增加或调整决策变量、目标函数项及约束结构。"},
    L4: {name:"场景语义推理与结构扩展型建模", desc:"同时完成场景语义推理和模型结构扩展，形成更复杂的优化模型。"}
  };
  const CASES = [
    {
      id:"E1-L1",level:"L1",appendix:"E.1",title:"IEEE 39节点系统显式参数修改",
      summary:"对IEEE 39节点交流最优潮流模型，按明确数值要求修改负荷、机组出力上限、节点电压下限和线路电抗。",
      prompt_zh:"请针对IEEE 39节点系统（case39）建立交流最优潮流（ACOPF）模型。将1号母线有功负荷乘以1.5；将32号母线所连接的全部发电机最大有功出力设为500 MW；将10号母线的最低电压幅值限制（VMIN）设为0；将2号母线与25号母线之间线路的电抗设为0.01；将潮流优化约束容差（opf.violation）设为1e-8。请生成对应的MATPOWER代码。",
      prompt_en:"Perform AC optimal power flow (ACOPF) on the IEEE 39-bus system (case39). Scale the active power demand at bus 1 by a factor of 1.5. Set the maximum active power output of all generators at bus 32 to 500 MW. Relax the minimum voltage magnitude constraint at bus 10 by setting VMIN to 0. Set the branch reactance for the line between bus 2 and bus 25 to 0.01. Set the OPF violation tolerance (opf.violation) to 1e-8, and write the corresponding MATPOWER code."
    },
    {
      id:"E2-L2",level:"L2",appendix:"E.2",title:"IEEE 14节点系统运行场景语义推理",
      summary:"根据深夜工业负荷下降、线路电容充电效应及节点电压升高等运行现象，推断相关负荷与无功补偿设备的调整方向。",
      prompt_zh:"某区域电网采用IEEE 14节点系统（case14）建模。深夜时段，3号母线工业负荷显著下降，有功和无功需求均明显减少。远距离输电线路出现较明显的电容充电效应，导致8号母线电压升高。为降低电压超过上限的风险，需要切除5号母线的并联电容器组。同时，3号母线无功需求下降进一步加剧电压升高现象。请将潮流优化约束容差（opf.violation）设为1e-6，采用MIPS求解器求解交流最优潮流（ACOPF），并生成对应MATPOWER代码。所有由运行场景推断的参数均使用占位符表示，参数取值应符合上述变化方向。",
      prompt_en:"A regional grid is modeled using the IEEE 14-bus system (case14). During the late-night hours, industrial loads at bus 3 are significantly reduced, causing both active and reactive power demand to decrease substantially. The long-distance transmission lines exhibit pronounced capacitive charging effects, leading to elevated voltage levels at bus 8. To mitigate the risk of voltage exceeding the upper limit, shunt capacitor banks at bus 5 need to be disconnected. Meanwhile, the reduced reactive power demand at bus 3 further contributes to the voltage rise phenomenon. Set opf.violation to 1e-6, use MIPS as the ACOPF solver, and generate the corresponding MATPOWER code. All scenario-driven parameters are assigned using placeholder values of the form object parameter id, which represent the post-modification values consistent with the specified scenario directions."
    },
    {
      id:"E3-L3",level:"L3",appendix:"E.3",title:"IEEE 39节点系统目标函数结构扩展",
      summary:"建立直流最优潮流模型，在基础发电成本之外增加线路相角差二次惩罚项，并完成显式参数修改。",
      prompt_zh:"请针对IEEE 39节点系统（case39）建立直流最优潮流（DCOPF）模型。在基础算例默认发电成本之外，增加所有在役输电线路的相角差二次惩罚项，以抑制过大的相角分离，惩罚权重β=10。将1号母线有功负荷乘以1.5；将32号母线所连接发电机的最大有功出力设为500 MW；将2号母线与25号母线之间线路的电抗设为0.01；将潮流优化约束容差（opf.violation）设为1e-8。请生成对应的MATPOWER代码。",      prompt_en:"Build a DC optimal power flow (DCOPF) optimization problem for the IEEE 39-bus system (case39). In addition to the default generation cost in the base case, add a quadratic penalty on phase-angle differences across all in-service transmission lines to discourage excessive angle separation (penalty weight beta = 10). Scale the active power demand at bus 1 by 1.5, set the maximum active power output of the generator(s) connected to bus 32 to 500 MW, and set the branch reactance of the line between bus 2 and bus 25 to 0.01. Assign opf.violation to 1e-8, and create the corresponding MATPOWER code."
    },
    {
      id:"E4-L4",level:"L4",appendix:"E.4",title:"IEEE 39节点系统场景推理与结构扩展",
      summary:"从低负荷、机组部分检修和输电线路升级推断参数变化方向，同时扩展目标函数。",
      prompt_zh:"请针对IEEE 39节点系统（case39）建立直流最优潮流（DCOPF）模型。在低负荷运行时段，由于工业用电减少，1号母线有功负荷预计下降；32号母线所连接的一台发电机处于部分检修状态，其可用最大有功出力降低；2号母线与25号母线之间的输电线路经过升级改造，线路电抗降低。为抑制该运行条件下过大的相角分离，在所有在役输电线路上增加相角差二次惩罚项，惩罚权重β=10；将潮流优化约束容差（opf.violation）设为1e-8。请生成对应的MATPOWER代码。场景驱动的参数使用占位符表示，取值方向应符合上述运行场景。",      prompt_en:"Build a DC optimal power flow (DCOPF) optimization problem for the IEEE 39-bus system (case39). During a low-load operating period, the active power demand at bus 1 is expected to decrease because of reduced industrial consumption. A generator connected to bus 32 is undergoing partial maintenance, reducing its available maximum active power output. In addition, a transmission upgrade on the line between bus 2 and bus 25 lowers the branch reactance. To discourage excessive phase-angle separation under this stressed operating condition, add a quadratic penalty on phase-angle differences across all in-service transmission lines with penalty weight beta = 10. Assign opf.violation to 1e-8, and generate the corresponding MATPOWER code. All scenario-driven parameters are assigned using placeholder values of the form object parameter id, which represent the post-modification values consistent with the specified scenario directions."
    }
  ];
  // 下文是平台的API工作区。题库原文保留于上方，界面和请求默认使用中文。
  LEVELS.L3={name:'显式参数与模型结构扩展型建模',desc:'显式数值参数修改与决策变量、目标函数或约束结构的扩展相结合。'};
  LEVELS.L4={name:'场景语义推理与模型结构扩展型建模',desc:'根据场景推断参数变化方向，并同时扩展数学模型结构。'};
  for(const c of CASES) {
    if(['L2','L4'].includes(c.level)) c.prompt_zh+=' 占位符按 object_parameter_id 形式命名，表示符合场景变化方向的修改后参数值。';
    c.source_page=({'L1':37,'L2':40,'L3':43,'L4':47})[c.level];
  }
  const DEMO4='请为一个四节点小型电力系统建立经济调度优化模型，并生成 Python + coptpy 代码。节点1、2为发电站，发电成本分别为300元/MWh和500元/MWh，最大发电功率均为100 MW；节点3、4分别需要50 MW、100 MW。五条线路依次为(1,2)、(1,4)、(2,3)、(2,4)、(3,4)，允许开断；投入运行时支持双向潮流并产生固定连接成本。各线路固定连接成本依次为50元、50元、50元、150元、50元，输电容量依次为50 MW、50 MW、100 MW、100 MW、100 MW。请确定各发电机出力、线路开关状态和线路潮流，以使总运行成本最小。';
  const $id=id=>document.getElementById(id);
  const escHTML=v=>esc(String(v??''));
  const originalBind=bind;
  let lastModelOutput=null,origin='empty',outputTab='all',requestTicket=0,modelBusy=false,requestLevel='';
  let currentCase=CASES[0],draft=CASES[0].prompt_zh,riskDraft=JSON.stringify({case_id:'待填写算例编号',model_version:'待填写模型版本',time_window:'待填写运行时段',assets:[]},null,2);
  S.level='L1';S.testCase=currentCase.id;
  const titles={home:'工作台',request:'需求理解',model:'动态建模',math:'数学模型',check:'模型校验',risk:'风险评估',solve:'优化求解',result:'结果分析',data:'数据与模型'};
  const workflow=active=>'<div class="workflow">'+['需求理解','动态建模','数学模型','模型校验','优化求解'].map((t,i)=>'<span class="'+(t===active?'current':'')+'">'+('0'+(i+1)).slice(-2)+' '+t+(i<4?'　/':'')+'</span>').join('')+'</div>';
  const tag=t=>'<span class="tag">'+escHTML(t)+'</span>';
  function field(label,id,value,placeholder='',type='text') {return '<div class="advanced-field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" autocomplete="'+(type==='password'?'new-password':'off')+'" value="'+escHTML(value)+'" placeholder="'+escHTML(placeholder)+'"></div>';}
  function configPanel() {
    const c=DaliAPI.config.get().llm;
    return '<section class="card api-config"><details '+(!c.baseUrl?'open':'')+'><summary>模型 API 接入设置</summary><p class="section-subtitle">填写服务商或课题团队提供的接口，无需在平台加载模型。</p><div class="advanced-grid">'+
      field('API 服务基础地址','llm-base',c.baseUrl,'https://api.example.com/v1')+field('模型标识','llm-model',c.model,'填写服务方提供的模型名')+
      field('对话接口路径','llm-chat',c.chatPath,'/chat/completions')+field('API 密钥','llm-key','',c.apiKeyConfigured?'已保留会话密钥；留空不修改':'仅保存在本次页面会话','password')+
      '<div class="advanced-field"><label for="llm-format">输出协议</label><select id="llm-format"><option value="json_object" '+(c.format==='json_object'?'selected':'')+'>JSON 模式</option><option value="prompt" '+(c.format!=='json_object'?'selected':'')+'>提示词约束 JSON</option></select></div></div><div class="form-actions"><button class="btn" id="llm-clear-key">清除密钥</button><button class="btn" id="llm-save">保存设置</button><button class="btn primary" id="llm-test">测试 API 连接</button></div><div class="request-status" id="llm-state" role="status">'+(c.baseUrl?'接口已配置，连接尚待验证。':'尚未配置接口。')+'</div><details class="config-help"><summary>接入说明</summary><p class="endpoint-note">采用 Chat Completions 兼容协议。测试按钮会发送一条最小请求，可能产生少量计费；不会在打开页面时发送请求。正式共享部署请使用项目服务端网关保管密钥。</p></details></details></section>';
  }
  function requestPage() {
    return title('需求工作区','自然语言建模','描述业务条件，逐项确认模型规格，再进入方程与代码工作区。')+workflow('需求理解')+
      '<div class="request-layout"><section class="card"><div class="card-head"><div><b>运行需求</b><div class="section-subtitle">文字描述将作为 API 请求内容</div></div>'+status('草案','blue')+'</div><div class="field"><label for="request-level">建模层级</label><select id="request-level"><option value="">由模型判定</option>'+Object.keys(LEVELS).map(k=>'<option value="'+k+'" '+(requestLevel===k?'selected':'')+'>'+k+' · '+LEVELS[k].name+'</option>').join('')+'</select></div><div class="field"><label for="req-input">需求描述</label><textarea id="req-input" style="min-height:240px">'+escHTML(S.requirement)+'</textarea></div><div class="form-actions"><button class="btn" id="load-demo4">四节点代码示例</button><button class="btn" id="send-req">保存需求</button><button class="btn primary" id="analyze-requirement" '+(modelBusy?'disabled':'')+'>生成建模草案</button></div><div id="request-state" class="request-status" role="status">'+(modelBusy?'请求处理中。':'尚未提交。')+'</div></section>'+card('需求确认清单',rows([['优化对象','电网范围与基础数据版本'],['运行目标','经济性、消纳或安全目标'],['决策内容','出力、状态及可调整设备'],['边界条件','设备限值与故障集合'],['时间要求','时域、时长与时间粒度'],['缺失信息','待确认，不由模型自行补造']])+'<div class="callout" style="margin-top:16px">先形成模型草案，再核对参数与约束。</div>')+'</div>'+configPanel();
  }
  function modelPage() {
    const levelCards=CASES.map(c=>'<button class="level '+(S.level===c.level?'selected':'')+'" data-choose-level="'+c.level+'"><span class="level-code">'+c.level+'</span><b>'+LEVELS[c.level].name+'</b><small>'+LEVELS[c.level].desc+'</small></button>').join('');
    return title('模型工作区','动态优化建模','四个建模层级，各对应一道论文评测题。中文题干可编辑，原文仅作来源对照。')+workflow('动态建模')+
      '<div class="level-strip">'+levelCards+'</div><div class="model-layout"><section class="card"><div class="card-head"><b>论文测试题库</b>'+tag('共 4 题')+'</div>'+CASES.map(c=>'<article class="case-card '+(currentCase.id===c.id?'selected':'')+'"><div class="case-level"><span class="level-code">'+c.level+'</span><div><b>'+c.title+'</b><small>'+LEVELS[c.level].name+'</small></div></div><p>'+c.summary+'</p><div class="form-actions"><span class="source-label">附录 '+c.appendix+' · 第 '+c.source_page+' 页</span><button class="btn" data-load-case="'+c.id+'">选用此题</button></div></article>').join('')+'</section>'+
      '<section class="card"><div class="card-head"><div><b>建模指令</b><div class="section-subtitle">'+escHTML(currentCase.level+' · '+LEVELS[currentCase.level].name)+'</div></div>'+tag(currentCase.level==='L2'?'IEEE 14 节点':'IEEE 39 节点')+'</div><div class="source-label">ProOPF-B · 附录 '+currentCase.appendix+' · 中文译文</div><div class="field"><label for="model-prompt">题目与运行条件</label><textarea id="model-prompt" style="min-height:285px">'+escHTML(draft)+'</textarea></div><div class="form-actions"><button class="btn" id="restore-case">恢复题干</button><button class="btn primary" id="generate-model" '+(modelBusy?'disabled':'')+'>'+(modelBusy?'正在生成…':'调用 API 生成模型')+'</button></div><div class="request-status" id="model-state" role="status">模型结果会分为数学表达、变量、目标、约束与代码。</div><details class="case-details source"><summary>论文英文原文与来源</summary><div class="case-prompt" lang="en">'+escHTML(currentCase.prompt_en)+'</div><p class="endpoint-note">中文题干保留母线编号、数值、变化方向与占位符规则；编辑后的指令按改写题处理。</p></details><details class="case-details"><summary>本题建模注意事项</summary><p class="endpoint-note">'+(currentCase.level==='L1'?'VMIN=0 是论文原题的测试条件，不作为现场电压限值建议。':currentCase.level==='L2'?'场景参数应保留为修改后值的占位输入。论文中的电压上限映射需在独立工程校验中复核，不直接作为运行建议。':'本题采用直流最优潮流并增加相角差二次惩罚项，β=10；不附加原题未要求的开关变量或N−1条件。')+'</p></details></section></div>'+configPanel();
  }
  function previewOutput() {
    const item=(id,name,expression,unit,scope)=>({id,name,expression,unit,scope,source:'人工整理的展示模板，非 API 返回或论文完整答案',status:'proposed'});
    const dc=['L3','L4'].includes(currentCase.level);
    return {schema_version:'1.0',request_summary:'以当前题目的模型类型展示分块格式。仅为人工整理的界面模板，未调用模型、未执行代码或求解。',model_meta:{problem_type:dc?'直流最优潮流（DCOPF）':'交流最优潮流（ACOPF）',system:currentCase.level==='L2'?'IEEE 14节点（case14）':'IEEE 39节点（case39）',time_horizon:null,model_level:currentCase.level},sets_parameters:[item('P01','基础电网数据','母线、发电机、支路数据由对应基础算例提供',null,'基础算例'),...(dc?[item('P02','相角差惩罚权重','β = 10',null,'全部在役输电线路')]:[])],mathematical_model:{formulation:dc?'min  C_gen(P_g) + β ‖Eθ‖₂²\ns.t. g_DC(θ, P_g; π) = 0, h_DC(θ, P_g; π) ≤ 0':'min  C_gen(P_g)\ns.t. g_AC(V, θ, P_g, Q_g; π) = 0\n      h_AC(V, θ, P_g, Q_g; π) ≤ 0',equations:[],notes:['采用抽象函数表示基础潮流约束。具体方程、参数及单位由模型服务生成并校验。']},decision_variables:[item('X01','发电机有功出力','P_g', 'MW','发电机集合'),item('X02','母线电压相角','θ_i','rad','母线集合'),...(!dc?[item('X03','母线电压幅值','V_i','p.u.','母线集合'),item('X04','发电机无功出力','Q_g','MVAr','发电机集合')]:[])],objective:{sense:'minimize',expression:dc?'C_gen(P_g) + 10 ‖Eθ‖₂²':'C_gen(P_g)',terms:[item('OBJ01','发电成本','C_gen(P_g)',null,'基础算例成本函数'),...(dc?[item('OBJ02','线路相角差惩罚','β ‖Eθ‖₂²',null,'全部在役输电线路')]:[])],rationale:dc?'原题要求在基础发电成本外增加线路相角差二次惩罚。':'原题采用基础最优潮流目标。'},constraints:[item('C01','功率平衡','g(x; π) = 0',null,'基础算例'),item('C02','设备与网络边界','h(x; π) ≤ 0',null,'由模型服务展开')],assumptions:['公式为版式模板，不是完整可执行优化模型。'],missing_information:['基础数据版本与具体约束表达尚待绑定。'],structural_changes:dc?[item('DELTA01','目标函数结构扩展','新增 β ‖Eθ‖₂²',null,'原题显式指定')]:[],solver_specification:{solver:currentCase.level==='L2'?'MIPS':null,tolerance:currentCase.level==='L2'?1e-6:1e-8,output_settings:[]},code:{language:'MATLAB',framework:'MATPOWER',entrypoint:'待生成',source:'% 格式展示模板，未执行\n% 1. 读取对应基础算例\n% 2. 应用参数修改与结构扩展\n% 3. 由受控求解服务计算\n% 完整代码待模型 API 返回',dependencies:['MATPOWER']},validation:{syntax:'pending',dimensions:'pending',physical:'pending',solver_readiness:'pending',findings:['展示模板没有经过独立校验。']},provenance:{source_case:currentCase.appendix,model_name:null,generated_at:null}};
  }
  function emptyOutput() {
    const x=previewOutput();x.request_summary='尚未生成模型。提交需求后，模型结果将在此分区展示。';x.mathematical_model={formulation:'等待模型表达',equations:[],notes:[]};x.sets_parameters=[];x.decision_variables=[];x.objective={sense:'minimize',expression:'等待目标函数',terms:[],rationale:''};x.constraints=[];x.structural_changes=[];x.assumptions=[];x.code.source='% 等待代码';x.missing_information=['尚未生成模型'];return x;
  }
  const statusNames={pending:'待校验',not_run:'未执行',passed:'已通过',failed:'未通过',proposed:'待确认',confirmed:'模型标记确认',rejected:'已拒绝'};
  function entries(items) {
    if(!items.length) return '<p class="muted">暂无条目</p>';
    return items.map(x=>'<div class="model-item"><div class="model-item-head"><span class="model-item-id">'+escHTML(x.id)+'</span><strong>'+escHTML(x.name)+'</strong>'+tag(statusNames[x.status]||x.status)+'</div><div class="item-expression">'+escHTML(x.expression)+'</div><div class="item-detail">'+[x.symbol&&'符号：'+x.symbol,x.unit&&'单位：'+x.unit,x.scope&&'作用范围：'+x.scope].filter(Boolean).map(escHTML).join('　')+'</div><div class="item-detail">依据：'+escHTML(x.source)+'</div></div>').join('');
  }
  const texts=a=>a.length?'<ul>'+a.map(x=>'<li>'+escHTML(x)+'</li>').join('')+'</ul>':'<p class="muted">暂无内容</p>';
  const kv=a=>'<div class="output-kv">'+a.map(([k,v])=>'<span>'+escHTML(k)+'</span><span>'+escHTML(v??'—')+'</span>').join('')+'</div>';
  function block(n,name,body,group,wide=false){return '<section class="output-block '+(wide?'wide':'')+'" data-group="'+group+'" '+(outputTab!=='all'&&group!==outputTab?'hidden':'')+'><h4>'+n+' · '+name+'</h4>'+body+'</section>';}
  function mathPage() {
    const x=lastModelOutput||emptyOutput();
    const tabs=[['all','全部内容'],['spec','模型规格'],['form','数学模型'],['vars','决策变量'],['objective','目标与约束'],['code','代码实现'],['validation','校验与来源']];
    const caption=origin==='preview'?'展示模板 · 非模型生成':origin==='api'?'API 返回 · 待独立校验':origin==='import'?'导入数据 · 待独立校验':'等待生成';
    return title('建模成果','数学模型工作区','同一份结构化模型，分区审阅、复制和导出。','<div class="result-toolbar"><button class="btn" id="preview-output">查看展示样例</button><button class="btn" id="import-output">导入结果</button><input type="file" accept="application/json,.json" id="output-file" hidden><button class="btn primary" id="download-output" '+(!lastModelOutput?'disabled':'')+'>导出模型</button></div>')+workflow('数学模型')+
      '<section class="card advanced-panel" style="margin-top:0"><div class="card-head"><div><b>'+escHTML(origin==='empty'?'模型输出':x.model_meta.system+' · '+x.model_meta.problem_type)+'</b><div class="section-subtitle">'+escHTML(x.model_meta.model_level+' · '+LEVELS[x.model_meta.model_level].name)+'</div></div>'+status(caption,'blue')+'</div><div class="tabs">'+tabs.map(([id,name])=>'<button class="tab '+(id===outputTab?'active':'')+'" data-output-tab="'+id+'">'+name+'</button>').join('')+'</div><div class="output-grid">'+
      block('01','问题与模型信息','<p>'+escHTML(x.request_summary)+'</p>'+kv([['问题类型',x.model_meta.problem_type],['基础系统',x.model_meta.system],['时间范围',x.model_meta.time_horizon],['建模层级',x.model_meta.model_level+' · '+LEVELS[x.model_meta.model_level].name]]),'spec')+
      block('02','集合与参数',entries(x.sets_parameters),'spec')+
      block('03','数学模型表达','<div class="formula-view">'+escHTML(x.mathematical_model.formulation)+'</div>'+entries(x.mathematical_model.equations)+texts(x.mathematical_model.notes),'form',true)+
      block('04','决策变量',entries(x.decision_variables),'vars',true)+
      block('05','目标函数','<div class="formula-view">'+(x.objective.sense==='minimize'?'最小化　':'最大化　')+escHTML(x.objective.expression)+'</div><p>'+escHTML(x.objective.rationale)+'</p>'+entries(x.objective.terms),'objective')+
      block('06','约束方程',entries(x.constraints),'objective')+
      block('07','结构变更',entries(x.structural_changes),'spec')+
      block('08','假设与待补充信息','<p>建模假设</p>'+texts(x.assumptions)+'<p>待补充信息</p>'+texts(x.missing_information),'spec')+
      block('09','代码实现',kv([['代码语言',x.code.language],['建模框架',x.code.framework],['入口',x.code.entrypoint],['依赖',x.code.dependencies.join('、')]])+'<pre class="code">'+escHTML(x.code.source)+'</pre><div class="form-actions"><button class="btn" id="copy-code">复制代码</button><button class="btn" id="download-code">下载代码</button></div>','code',true)+
      block('10','独立校验状态',kv([['语法',statusNames[x.validation.syntax]],['维度',statusNames[x.validation.dimensions]],['物理',statusNames[x.validation.physical]],['求解准备',statusNames[x.validation.solver_readiness]]])+texts(x.validation.findings),'validation')+
      block('11','求解配置与来源',kv([['求解器',x.solver_specification.solver],['容差',x.solver_specification.tolerance],['输出设置',x.solver_specification.output_settings.join('、')||'—'],['来源题目',x.provenance.source_case],['模型标识',x.provenance.model_name],['记录时间',x.provenance.generated_at]]),'validation')+
      '</div><div class="form-actions"><button class="btn" id="output-json">查看完整 JSON</button><button class="btn" id="output-clear">清除结果</button><button class="btn" data-go="check">进入模型校验 →</button></div><pre class="code" id="output-raw" hidden>'+escHTML(JSON.stringify(x,null,2))+'</pre></section>';
  }
  const oldRisk=renderers.risk;
  function riskPage() {
    const c=DaliAPI.config.get().risk;
    return oldRisk()+'<section class="card advanced-panel"><details '+(!c.baseUrl?'open':'')+'><summary>风险评估 API 接口</summary><div class="advanced-grid" style="margin-top:14px">'+field('服务基础地址','risk-base',c.baseUrl,'https://risk-api.example.com')+field('评估路径','risk-path',c.assessPath)+field('健康检查路径','risk-health',c.healthPath)+field('API 密钥','risk-key','',c.apiKeyConfigured?'已保留会话密钥；留空不修改':'仅保存在当前会话','password')+'</div><div class="form-actions"><button class="btn" id="risk-save">保存设置</button><button class="btn" id="risk-test">测试服务</button></div><div id="risk-state" class="request-status">尚未测试服务。</div></details></section><section class="card advanced-panel"><div class="card-head"><b>工况评估请求</b>'+status('接口草案','blue')+'</div><div class="field"><label for="risk-payload">工况与设备数据（JSON）</label><textarea id="risk-payload" style="min-height:170px">'+escHTML(riskDraft)+'</textarea></div><div class="form-actions"><button class="btn primary" id="risk-assess">提交风险评估</button></div><pre class="code" id="risk-result">尚未提交。</pre></section>';
  }
  renderers.request=requestPage;renderers.model=modelPage;renderers.math=mathPage;renderers.risk=riskPage;
  function download(text,name,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function saveLLM(){return DaliAPI.config.save({llm:{baseUrl:$id('llm-base').value,model:$id('llm-model').value,chatPath:$id('llm-chat').value,format:$id('llm-format').value,apiKey:$id('llm-key').value}});}
  function saveRisk(){return DaliAPI.config.save({risk:{baseUrl:$id('risk-base').value,assessPath:$id('risk-path').value,healthPath:$id('risk-health').value,apiKey:$id('risk-key').value}});}
  function chooseCase(c){currentCase=c;S.testCase=c.id;S.level=c.level;draft=c.prompt_zh;requestTicket++;modelBusy=false;render();}
  async function generate(kind) {
    if(modelBusy) return;
    const prompt=(kind==='model'?$id('model-prompt'):$id('req-input')).value.trim();
    if(!prompt) return notify('请先填写建模需求');
    if(kind==='model') draft=prompt;else S.requirement=prompt;
    const ticket=++requestTicket;modelBusy=true;
    const button=$id(kind==='model'?'generate-model':'analyze-requirement');const statusEl=$id(kind==='model'?'model-state':'request-state');
    button.disabled=true;button.textContent='请求处理中…';statusEl.textContent='正在等待模型 API 返回。';
    const level=kind==='model'?S.level:requestLevel,source=kind==='model'?currentCase.appendix+(prompt!==currentCase.prompt_zh?'（题干已改写）':'（中文译文）'):'自定义中文需求';
    try {
      saveLLM();
      const submittedModel=DaliAPI.config.get().llm.model;
      const payload={level:level||null,level_name:level?LEVELS[level].name:'由模型判定',prompt,natural_language:prompt,source_case:source,output_schema:DaliContract.schema};
      const response=await (kind==='model'?DaliAPI.modeling.buildModel(payload):DaliAPI.llm.analyzeRequirement(payload));
      if(ticket!==requestTicket) return;
      const received=DaliContract.parse(response,{source_case:source,model_name:submittedModel,generated_at:new Date().toISOString()});
      if(level && received.model_meta.model_level!==level) throw new Error('返回模型的层级与当前任务不一致');
      lastModelOutput=received;origin='api';outputTab='all';modelBusy=false;go('math');notify('已收到模型草案，独立校验尚未执行');
    } catch(e) {if(ticket===requestTicket){statusEl.textContent='请求未完成：'+e.message;notify(e.message);}}
    finally {if(ticket===requestTicket){modelBusy=false;if(button.isConnected){button.disabled=false;button.textContent=kind==='model'?'调用 API 生成模型':'生成建模草案';}}}
  }
  function invalidateDraft(){
    const wasBusy=modelBusy;requestTicket++;modelBusy=false;
    for(const id of ['generate-model','analyze-requirement']){const b=$id(id);if(b){b.disabled=false;b.textContent=id==='generate-model'?'调用 API 生成模型':'生成建模草案';}}
    if(wasBusy){const el=$id('model-state')||$id('request-state');if(el)el.textContent='需求已修改，旧请求返回不会覆盖当前草案。';}
  }
  bind=function(){
    originalBind();
    document.querySelectorAll('[data-choose-level]').forEach(b=>b.addEventListener('click',()=>chooseCase(CASES.find(c=>c.level===b.dataset.chooseLevel))));
    document.querySelectorAll('[data-load-case]').forEach(b=>b.addEventListener('click',()=>chooseCase(CASES.find(c=>c.id===b.dataset.loadCase))));
    $id('model-prompt')?.addEventListener('input',e=>{draft=e.target.value;invalidateDraft();});
    $id('request-level')?.addEventListener('change',e=>{requestLevel=e.target.value;invalidateDraft();});
    $id('restore-case')?.addEventListener('click',()=>chooseCase(currentCase));
    $id('req-input')?.addEventListener('input',e=>{S.requirement=e.target.value;invalidateDraft();});
    $id('load-demo4')?.addEventListener('click',()=>{S.requirement=DEMO4;requestTicket++;modelBusy=false;render();$id('request-state').textContent='来源：铮昊 demo_4.py 四节点题。该题不是论文L1—L4评测样例；运行时长和固定成本计费口径仍需确认。';});
    $id('generate-model')?.addEventListener('click',()=>generate('model'));
    $id('analyze-requirement')?.addEventListener('click',()=>generate('request'));
    $id('llm-save')?.addEventListener('click',()=>{saveLLM();$id('llm-state').textContent='设置已保存；密钥仅在当前会话中保留。';});
    $id('llm-clear-key')?.addEventListener('click',()=>{DaliAPI.config.save({llm:{clearKey:true}});$id('llm-key').value='';$id('llm-state').textContent='已清除会话密钥。';});
    $id('llm-test')?.addEventListener('click',async()=>{const el=$id('llm-state'),button=$id('llm-test');button.disabled=true;try{saveLLM();el.textContent='正在测试 API…';await DaliAPI.llm.testConnection();el.textContent='已收到服务响应，可进行模型生成。';}catch(e){el.textContent=e.message;}finally{button.disabled=false;}});
    $id('risk-save')?.addEventListener('click',()=>{saveRisk();$id('risk-state').textContent='风险评估接口设置已保存。';});
    $id('risk-test')?.addEventListener('click',async()=>{const el=$id('risk-state');try{saveRisk();el.textContent='正在测试…';await DaliAPI.topic3.testConnection();el.textContent='已收到健康检查响应。';}catch(e){el.textContent=e.message;}});
    $id('risk-payload')?.addEventListener('input',e=>{riskDraft=e.target.value;});
    $id('risk-assess')?.addEventListener('click',async()=>{const el=$id('risk-result');try{saveRisk();const p=JSON.parse($id('risk-payload').value);if(!p||Array.isArray(p)||typeof p!=='object')throw new Error('请求内容应为JSON对象');el.textContent='正在提交…';el.textContent=JSON.stringify(await DaliAPI.topic3.assessRisk(p),null,2);}catch(e){el.textContent='请求未完成：'+e.message;}});
    document.querySelectorAll('[data-output-tab]').forEach(b=>b.addEventListener('click',()=>{outputTab=b.dataset.outputTab;render();}));
    $id('preview-output')?.addEventListener('click',()=>{lastModelOutput=previewOutput();origin='preview';outputTab='all';render();});
    $id('output-json')?.addEventListener('click',()=>{$id('output-raw').hidden=!$id('output-raw').hidden;});
    $id('output-clear')?.addEventListener('click',()=>{lastModelOutput=null;origin='empty';render();});
    $id('download-output')?.addEventListener('click',()=>{if(lastModelOutput)download(JSON.stringify({ ...lastModelOutput,display_origin:origin},null,2),'大理电网_模型草案.json');});
    $id('copy-code')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText((lastModelOutput||emptyOutput()).code.source);notify('已复制代码文本');}catch{notify('浏览器限制复制，请使用下载代码');}});
    $id('download-code')?.addEventListener('click',()=>{const x=lastModelOutput||emptyOutput();download(x.code.source,'模型代码_待校验.'+(/python/i.test(x.code.language)?'py':'m'),'text/plain;charset=utf-8');});
    $id('import-output')?.addEventListener('click',()=>$id('output-file').click());
    $id('output-file')?.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1500000)throw new Error('文件过大');const x=DaliContract.parse(JSON.parse(await f.text()),{model_name:'用户导入'});lastModelOutput=x;origin='import';outputTab='all';render();}catch(err){notify('导入失败：'+err.message);}});
  };
  window.DaliModelOutput={cases:CASES,levels:LEVELS,getOutput:()=>lastModelOutput,setOutput:obj=>{lastModelOutput=DaliContract.parse(obj);origin='import';if(S.page==='math')render();},getOrigin:()=>origin};
  render();
})();
