from __future__ import annotations
import ast, copy, hashlib, json, math, re
from pathlib import Path
from collections import defaultdict
ROOT=Path(__file__).resolve().parent
CASE=json.loads((ROOT/'data/case905.json').read_text(encoding='utf-8'))
ENTITIES={x['id']:x for k in ('buses','generators','branches') for x in CASE[k]}
LEVELS={'L1':'显式参数修改型建模','L2':'场景语义参数推理型建模','L3':'显式参数与模型结构扩展型建模','L4':'场景语义推理与模型结构扩展型建模'}
FIELDS={'B':{'PD':'MW','QD':'Mvar','VMAX':'p.u.','VMIN':'p.u.'},'G':{'PG':'MW','QG':'Mvar','PMAX':'MW','PMIN':'MW','QMAX':'Mvar','QMIN':'Mvar','GEN_STATUS':'binary'},'L':{'RATE_A':'MVA','BR_X':'p.u.','BR_R':'p.u.','BR_STATUS':'binary'}}
SCENARIOS=[
 {'id':'D905-L1','level':'L1','title':'负荷与机组容量调整','prompt':'基于905节点交流OPF模型，将母线B3的有功负荷提高10%；将机组G1的有功出力上限设置为30MW；保持模型结构不变。采用单断面演示模式，16个时段，每时段15分钟。'},
 {'id':'D905-L2','level':'L2','title':'高温线路容量调整','prompt':'基于905节点交流OPF模型，受持续高温影响，线路L151的热稳定裕度下降，需要收紧线路容量。具体调整幅度尚待确认，保持模型结构不变。采用单断面演示模式，16个时段，每时段15分钟。'},
 {'id':'D905-L3','level':'L3','title':'线路开断与机组联合调整','prompt':'将905节点母线B3的有功负荷提高10%；从OPF扩展为OTS，允许网状支路开断，同时调整机组出力；每个时段最多开断1条支路，全时域最多4次开关动作；增加电压偏移目标项。采用单断面演示模式，16个时段，每时段15分钟。'},
 {'id':'D905-L4','level':'L4','title':'高温降额与方式协同调整','prompt':'在905节点系统中，高温使线路L151的热稳定裕度下降，同时机组G1需要降额运行。请推断参数调整方向，具体幅度由调度员确认；从OPF扩展为OTS，允许网状支路开断并联合调整机组出力；增加电压偏移目标项。采用单断面演示模式，16个时段，每时段15分钟。'}]

def fingerprint(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def finite(x):return isinstance(x,(int,float)) and not isinstance(x,bool) and math.isfinite(x)
def canonical_id(s):
    s=str(s).upper().replace(' ','')
    m=re.fullmatch(r'(母线|节点|支路|线路|机组)?([BLG]?)(\d+)',s)
    if not m:return s
    p=m[2] or {'母线':'B','节点':'B','支路':'L','线路':'L','机组':'G'}.get(m[1],'B')
    return p+str(int(m[3]))
def object_tokens(text):
    pattern=r'(?:(?:母线|节点|支路|线路|机组)\s*)?[BLG]\s*\d+|(?:母线|节点|支路|线路|机组)\s*\d+'
    return [(canonical_id(m.group()),m.start(),m.end()) for m in re.finditer(pattern,text,re.I)]
def default_spec():
    return {'schema_version':'2.0','case_id':'DALI905','data_sha256':CASE['sha256'],'level':'L1','omega':{'base_model':'AC-OPF','snapshot':CASE['snapshot_name']},'delta_pi':[],'s':{'types':['OPF','DISPATCH'],'objectives':[{'kind':'redispatch','weight':1.0}],'constraints':[],'security':'N0','protected_branches':[]},'R':{'solver':'IPOPT','periods':16,'step_minutes':15,'series_mode':'single_snapshot','candidate_scope':'mesh','rate_zero_policy':'pending','b_convention':'pending','tolerance':1e-6},'conditions':[],'missing_information':[],'inference_chain':[],'prompt':''}

def analyze(text):
    if not isinstance(text,str) or not 1<=len(text.strip())<=40000:raise ValueError('请输入有效调度需求，最多40000字')
    spec=default_spec();spec['prompt']=text;clauses=[c.strip() for c in re.split('[；;。\n]+',text) if c.strip()]
    no_structure=bool(re.search(r'(不改|不改变|保持)(?:模型)?结构',text))
    positive=re.sub(r'(不考虑|不允许|不启用|无需)[^；;。\n]*','',text)
    structural=not no_structure and bool(re.search(r'OTS|开断|启停|增加.*(?:目标|约束)|新增|扩展为|单时段.*(?:限制|最多)',positive,re.I))
    if 'DC' in text.upper() or '直流' in text:spec['omega']['base_model']='DC-OPF'
    if not no_structure and re.search(r'OTS|允许.*开断|最优输电切换',positive,re.I):spec['s']['types'].append('OTS')
    if not no_structure and '启停' in positive:spec['s']['types'].append('UC')
    if re.search(r'N[−-]?1|单一故障',positive,re.I):spec['s']['security']='N-1'
    if '电压偏移' in positive:spec['s']['objectives']=[{'kind':'voltage_deviation','weight':1.0}]
    if re.search(r'发电成本|经济性|经济成本|经济运行',positive):spec['s']['objectives'].append({'kind':'economy','weight':1.0})
    if re.search(r'新能源消纳|弃风|弃光',positive):spec['s']['objectives'].append({'kind':'renewable','weight':1.0})
    if '全部支路' in positive:spec['R']['candidate_scope']='all'
    elif '110' in positive and '开断' in positive:spec['R']['candidate_scope']='mesh110'
    for pattern,field in [(r'(\d+)\s*个?时段','periods'),(r'(?:每时段|每个时段|时间粒度为?)\s*(\d+)\s*分钟','step_minutes')]:
        m=re.search(pattern,text)
        if m:spec['R'][field]=int(m[1])
    for pat,kind in [(r'(?:最多|不超过)\s*(\d+)\s*次(?:开关)?动作','switch_budget'),(r'(?:最多|不超过)(?:开断)?\s*(\d+)\s*条(?:支路|线路)','max_open')]:
        m=re.search(pat,text)
        if m:spec['s']['constraints'].append({'kind':kind,'value':int(m[1]),'source':m.group()})
    aliases=[('PMAX',r'出力上限|最大(?:有功)?出力|最大有功|容量上限|降额'),('PMIN',r'出力下限|最小(?:有功)?出力'),('QMAX',r'无功上限'),('QMIN',r'无功下限'),('VMAX',r'电压上限'),('VMIN',r'电压下限'),('RATE_A',r'容量|热稳定|热稳|额定'),('BR_X',r'电抗'),('BR_R',r'电阻'),('QD',r'无功负荷'),('PD',r'有功负荷|负荷|需求'),('PG',r'有功出力|出力')]
    for ci,c in enumerate(clauses):
        toks=object_tokens(c);ids=[o[0] for o in toks]
        category='参数' if ids else '时段' if re.search(r'时段|分钟|断面',c) else '目标' if re.search(r'目标|经济|消纳',c) else '约束' if re.search(r'最多|约束|开断|启停|N[−-]?1',c,re.I) else '场景'
        condition={'id':'C'+str(ci+1),'text':c,'objects':ids,'category':category,'confirmed':False};spec['conditions'].append(condition)
        for oi,(oid,a,b) in enumerate(toks):
            segment=c[b:toks[oi+1][1] if oi+1<len(toks) else len(c)]
            if oid not in ENTITIES:spec['missing_information'].append({'id':'object:'+oid,'question':'未找到对象 '+oid,'kind':'object','options':[]});continue
            field=next((f for f,p in aliases if re.search('(?:'+p+'|\\b'+f+'\\b)',segment,re.I) and f in FIELDS[oid[0]]),None)
            if oid[0]=='L' and re.search(r'断开|停运|开断',segment) and not re.search(r'允许|最多|不',segment):field='BR_STATUS'
            if not field:continue
            op='set';value=None;direction=None
            m=re.search(r'(提高|增加|上调|降低|下降|减少|下调|收紧|缩减)\s*(\d+(?:\.\d+)?)\s*%',segment)
            if m:op='scale';value=1+(-1 if m[1] in ['降低','下降','减少','下调','收紧','缩减'] else 1)*float(m[2])/100
            else:
                m=re.search(r'(?:设置?为|调整为|设成|改为|取值为)\s*(-?\d+(?:\.\d+)?)(?![\d.])',segment)
                if m:value=float(m[1])
                elif field=='BR_STATUS':value=0
                elif re.search(r'降额|收紧|下降|降低|削减|减少',segment):direction='decrease'
                elif re.search(r'上升|增加|提高|增长',segment):direction='increase'
            if value is None and direction is None:continue
            patch={'id':'P'+str(len(spec['delta_pi'])+1),'entity_id':oid,'field':field,'operation':op if value is not None else 'direction','value':value,'direction':direction,'unit':FIELDS[oid[0]][field],'time_from':1,'time_to':spec['R']['periods'],'source':c,'requirement_id':condition['id']}
            spec['delta_pi'].append(patch)
            if value is None:
                spec['missing_information'].append({'id':'value:'+patch['id'],'question':oid+' '+field+' 的调整幅度是多少？','kind':'amplitude','patch_id':patch['id'],'options':[{'label':'下调5%' if direction=='decrease' else '上调5%','operation':'scale','value':.95 if direction=='decrease' else 1.05},{'label':'下调10%' if direction=='decrease' else '上调10%','operation':'scale','value':.9 if direction=='decrease' else 1.1}]})
                spec['inference_chain'].append({'event':'高温' if '高温' in text else c,'mechanism':'热稳定裕度下降' if field=='RATE_A' else '可用出力下降' if field=='PMAX' else '运行工况变化','parameter':oid+'.'+field,'direction':direction,'source':c})
    if not spec['delta_pi']:
        semantic_rules=[(r'高温|热浪|覆冰|覆雪|强风|大风','L','热稳定裕度下降','RATE_A','decrease','线路'),(r'机组降额|机组故障|机组不可用|发电机降额','G','可用有功出力下降','PMAX','decrease','机组'),(r'负荷增长|高负荷|空调负荷|用电需求增加','B','有功负荷上升','PD','increase','母线')]
        for pattern,prefix,mechanism,param,direction,target in semantic_rules:
            m=re.search(pattern,text)
            if m:
                spec['inference_chain'].append({'event':m.group(),'mechanism':mechanism,'parameter':param+'（对象待指定）','direction':direction,'source':text})
                spec['missing_information'].append({'id':'target:'+param,'question':'请指定受影响的'+target+'编号（'+prefix+'+行号），系统不会自动替换或猜测对象。','kind':'target','options':[]})
    inferred=bool(spec['missing_information']) or any(x['value'] is None for x in spec['delta_pi']) or bool(re.search(r'推断|尚待确认|幅度.*确认',text))
    spec['level']=('L4' if inferred else 'L3') if structural else ('L2' if inferred else 'L1')
    if not spec['delta_pi'] and not structural:spec['missing_information'].append({'id':'no_change','question':'请选择需要调整的对象、参数和数值。','kind':'requirement','options':[]})
    return spec

def normalize(spec):
    if not isinstance(spec,dict):raise ValueError('模型规格必须为对象')
    x=copy.deepcopy(spec)
    if x.get('case_id')!='DALI905' or x.get('data_sha256')!=CASE['sha256']:raise ValueError('数据版本不匹配')
    if x.get('level') not in LEVELS:raise ValueError('请选择L1—L4建模层级')
    for k in ['omega','s','R']:
        if not isinstance(x.get(k),dict):raise ValueError('缺少规格 '+k)
    if x['omega'].get('base_model') not in ['AC-OPF','DC-OPF']:raise ValueError('基础模型不支持')
    R=x['R'];T=R.get('periods')
    if not isinstance(T,int) or isinstance(T,bool) or not 1<=T<=96:raise ValueError('时段数需在1—96之间')
    if R.get('step_minutes') not in [5,10,15,30,60]:raise ValueError('时间粒度不支持')
    if R.get('series_mode')!='single_snapshot':raise ValueError('本输入仅有单断面；连续断面请先导入')
    if R.get('candidate_scope') not in ['all','mesh','mesh110']:raise ValueError('候选集无效')
    if R.get('rate_zero_policy') not in ['pending','unlimited','blocked']:raise ValueError('零容量策略无效')
    if R.get('b_convention') not in ['pending','total','per_end']:raise ValueError('电纳口径无效')
    if R.get('solver') not in ['IPOPT','COPT','Gurobi','自动选择']:raise ValueError('求解器无效')
    if not finite(R.get('tolerance')) or not 0<R['tolerance']<=0.1:raise ValueError('容差无效')
    if not isinstance(x.get('prompt'),str) or len(x['prompt'])>40000:raise ValueError('需求原文无效')
    if not isinstance(x.get('conditions'),list) or len(x['conditions'])>1000:raise ValueError('条件列表无效')
    if any(not isinstance(c,dict) or not isinstance(c.get('text'),str) or not isinstance(c.get('objects'),list) or any(not isinstance(o,str) for o in c['objects']) for c in x['conditions']):raise ValueError('条件条目无效')
    if not isinstance(x.get('missing_information'),list) or not isinstance(x.get('inference_chain'),list):raise ValueError('追问和推断字段无效')
    if not isinstance(x.get('clarifications',''),str):raise ValueError('补充说明无效')
    unknown=sorted({oid for c in x['conditions'] for oid in c['objects'] if oid not in ENTITIES})
    if unknown:raise ValueError('未找到对象 '+', '.join(unknown[:10]))

    if not isinstance(x.get('delta_pi'),list) or len(x['delta_pi'])>3000:raise ValueError('参数修改表无效')
    seen=set()
    for i,p in enumerate(x['delta_pi']):
        if not isinstance(p,dict):raise ValueError('参数修改条目无效')
        oid=p.get('entity_id','');f=p.get('field','')
        if oid not in ENTITIES:raise ValueError('未找到对象 '+str(oid))
        if f not in FIELDS.get(oid[0],{}):raise ValueError(oid+' 不支持字段 '+str(f))
        if p.get('unit')!=FIELDS[oid[0]][f]:raise ValueError(oid+'.'+f+' 单位应为 '+FIELDS[oid[0]][f])
        if p.get('operation') not in ['set','scale','offset','direction']:raise ValueError('修改操作无效')
        if p.get('operation')!='direction' and not finite(p.get('value')):raise ValueError('修改值必须为有限数值')
        if p.get('operation')=='scale' and p['value']<0:raise ValueError('比例不能为负值')
        a,b=p.get('time_from',1),p.get('time_to',T)
        if type(a) is not int or type(b) is not int or not 1<=a<=b<=T:raise ValueError('修改时段范围无效')
        p.update(id=p.get('id') or 'P'+str(i+1),time_from=a,time_to=b)
        for t in range(a,b+1):
            key=oid,f,t
            if key in seen:raise ValueError('同一对象参数在重叠时段被重复修改：'+oid+'.'+f)
            seen.add(key)
        if p.get('value') is not None:
            old=ENTITIES[oid]['raw'][f];new=patch_value(old,p)
            if f in ['RATE_A','VMIN','VMAX'] and new<0:raise ValueError('参数不能为负：'+oid+'.'+f)
            if f in ['BR_STATUS','GEN_STATUS'] and new not in [0,1]:raise ValueError('状态必须为0或1')
            if f in ['BR_X','BR_R'] and abs(new)>100:raise ValueError('阻抗超出接口允许范围')
        if not isinstance(p.get('source',''),str):raise ValueError('原文来源需为文本')
    st=x['s'];types=st.get('types')
    if not isinstance(types,list) or not types or any(t not in ['OPF','OTS','DISPATCH','UC'] for t in types):raise ValueError('优化类型无效')
    if st.get('security') not in ['N0','N-1']:raise ValueError('安全场景无效')
    if not isinstance(st.get('objectives'),list) or not st['objectives']:raise ValueError('至少选择一个目标项')
    if any(not isinstance(o,dict) for o in st['objectives']) or len({o.get('kind') for o in st['objectives']})!=len(st['objectives']):raise ValueError('目标项类型无效或重复')
    if not isinstance(st.get('constraints'),list) or any(not isinstance(c,dict) for c in st['constraints']):raise ValueError('约束表无效')
    if len({c.get('kind') for c in st['constraints']})!=len(st['constraints']):raise ValueError('约束类型重复')
    if not isinstance(st.get('protected_branches'),list):raise ValueError('保护支路列表无效')
    for o in st['objectives']:
        if o.get('kind') not in ['redispatch','voltage_deviation','economy','reliability','renewable','line_loading']:raise ValueError('未知目标项')
        if not finite(o.get('weight')) or o['weight']<0:raise ValueError('目标权重需为非负数')
    if not any(o['weight']>0 for o in st['objectives']):raise ValueError('至少一个目标权重大于0')
    for c in st.get('constraints',[]):
        if c.get('kind') not in ['max_open','switch_budget','ramp','min_hold']:raise ValueError('未知约束类型')
        if not finite(c.get('value')) or c['value']<0:raise ValueError('约束值无效')
        if c['kind']!='ramp' and (int(c['value'])!=c['value'] or c['value']>100000):raise ValueError('操作次数和保持时段须为非负整数')
    for oid in st.get('protected_branches',[]):
        if oid not in ENTITIES or not oid.startswith('L'):raise ValueError('保护支路编号不存在')
    json.dumps(x,allow_nan=False)
    return x

def patch_value(old,p):
    if p['operation']=='direction':return old
    return p['value'] if p['operation']=='set' else old*p['value'] if p['operation']=='scale' else old+p['value']
def candidate_ids(spec):
    if 'OTS' not in spec['s']['types']:return []
    scope=spec['R']['candidate_scope'];protected=set(spec['s'].get('protected_branches',[]))
    return [l['id'] for l in CASE['branches'] if l['id'] not in protected and (scope=='all' or not l['bridge']) and (scope!='mesh110' or l['kv']>=110)]
def changed_rows(spec):
    return [{'id':p['id'],'object':p['entity_id'],'field':p['field'],'before':ENTITIES[p['entity_id']]['raw'][p['field']],'after':None if p['value'] is None else patch_value(ENTITIES[p['entity_id']]['raw'][p['field']],p),'unit':p['unit'],'periods':[p['time_from'],p['time_to']],'source':p['source']} for p in spec['delta_pi']]

def compile_spec(spec):
    x=normalize(spec);T=x['R']['periods'];N=len(CASE['buses']);G=len(CASE['generators']);E=len(CASE['branches']);C=len(candidate_ids(x));ac=x['omega']['base_model']=='AC-OPF';uc='UC' in x['s']['types']
    integer={'线路状态 z':C*T,'机组状态 u':G*T if uc else 0,'启动事件 v':G*T if uc else 0,'停机事件 w':G*T if uc else 0}
    variables=[{'symbol':'θᵢ,ₜ','name':'节点相角','domain':'连续','size':N*T,'unit':'rad'},{'symbol':'Pɢ,ₜ','name':'机组有功出力','domain':'连续','size':G*T,'unit':'MW'}]
    if ac:variables.extend([{'symbol':'Vᵢ,ₜ','name':'节点电压幅值','domain':'连续','size':N*T,'unit':'p.u.'},{'symbol':'Qɢ,ₜ','name':'机组无功出力','domain':'连续','size':G*T,'unit':'Mvar'}])
    variables.extend({'symbol':k.split()[-1],'name':k.split()[0],'domain':'二进制','size':v,'unit':'0/1'} for k,v in integer.items() if v)
    variables.extend([{'symbol':'Pˢˡ,ₜ / Pʳˡ,ₜ','name':'支路两端有功','domain':'连续','size':2*E*T,'unit':'MW'}])
    if ac:variables.append({'symbol':'Qˢˡ,ₜ / Qʳˡ,ₜ','name':'支路两端无功','domain':'连续','size':2*E*T,'unit':'Mvar'})
    if any(o['kind']=='redispatch' and o['weight']>0 for o in x['s']['objectives']):variables.append({'symbol':'ΔP⁺ / ΔP⁻','name':'出力调整辅助变量','domain':'连续','size':2*G*T,'unit':'MW'})
    if C and any(c['kind'] in ['switch_budget','min_hold'] for c in x['s']['constraints']):variables.append({'symbol':'aˡ,ₜ','name':'动作辅助变量','domain':'连续','size':C*T,'unit':'0—1'})
    formulas=[{'id':'BAL-P','name':'节点有功平衡','expression':'Σg∈Gᵢ Pɢ,ₜ − Pᴅ,ᵢ,ₜ = Σl∈δ⁺(i) Pˢˡ,ₜ + Σl∈δ⁻(i) Pʳˡ,ₜ + Gˢᵢ V²ᵢ,ₜ' if ac else 'Σg∈Gᵢ Pɢ,ₜ − Pᴅ,ᵢ,ₜ = Σl∈δ⁺(i) fˡ,ₜ − Σl∈δ⁻(i) fˡ,ₜ + Gˢᵢ','instances':N*T}, {'id':'GEN-P','name':'机组出力约束','expression':'Pɢ,min uɢ,ₜ ≤ Pɢ,ₜ ≤ Pɢ,max uɢ,ₜ' if uc else 'Pɢ,min ≤ Pɢ,ₜ ≤ Pɢ,max','instances':2*G*T}, {'id':'BRANCH','name':'线路输送约束','expression':'|Sˢˡ,ₜ|² ≤ (zˡ,ₜ Sˡ,max)²；|Sʳˡ,ₜ|² ≤ (zˡ,ₜ Sˡ,max)²' if ac else '−Fˡ,max zˡ,ₜ ≤ fˡ,ₜ ≤ Fˡ,max zˡ,ₜ','instances':2*E*T}, {'id':'REF','name':'参考相角','expression':'θB175,ₜ = 0','instances':T}]
    if ac:formulas.extend([{'id':'BAL-Q','name':'节点无功平衡','expression':'Σg∈Gᵢ Qɢ,ₜ − Qᴅ,ᵢ,ₜ = Σl∈δ⁺(i) Qˢˡ,ₜ + Σl∈δ⁻(i) Qʳˡ,ₜ − Bˢᵢ V²ᵢ,ₜ','instances':N*T},{'id':'AC-FLOW','name':'交流支路模型','expression':'Sˢˡ,ₜ = Vᵢ,ₜ · conj(Yffˡ(z) Vᵢ,ₜ + Yftˡ(z) Vⱼ,ₜ)','instances':4*E*T},{'id':'V-LIM','name':'电压范围','expression':'Vminᵢ ≤ Vᵢ,ₜ ≤ Vmaxᵢ','instances':2*N*T},{'id':'GEN-Q','name':'机组无功范围','expression':'Qɢ,min uɢ,ₜ ≤ Qɢ,ₜ ≤ Qɢ,max uɢ,ₜ' if uc else 'Qɢ,min ≤ Qɢ,ₜ ≤ Qɢ,max','instances':2*G*T}])
    else:formulas.append({'id':'DC-FLOW','name':'直流支路关系','expression':'fˡ,ₜ = zˡ,ₜ · baseMVA/(xˡ τˡ) · (θᵢ,ₜ−θⱼ,ₜ−φˡ)','instances':E*T})
    if uc:formulas.extend([{'id':'UC-TRANS','name':'启停状态转换','expression':'uɢ,ₜ − uɢ,ₜ₋₁ = vɢ,ₜ − wɢ,ₜ；vɢ,ₜ + wɢ,ₜ ≤ 1','instances':2*G*T}])
    for c in x['s'].get('constraints',[]):
        kind=c['kind'];expr={'max_open':'Σl∈C (1−zˡ,ₜ) ≤ '+str(c['value']),'switch_budget':'Σl,t |zˡ,ₜ−zˡ,ₜ₋₁| ≤ '+str(c['value']),'ramp':'|Pɢ,ₜ−Pɢ,ₜ₋₁| ≤ '+str(c['value'])+' MW','min_hold':'切换后保持 ≥ '+str(c['value'])+' 个时段'}[kind]
        formulas.append({'id':'EXT-'+kind,'name':{'max_open':'开断数量','switch_budget':'动作预算','ramp':'机组爬坡','min_hold':'状态保持'}[kind],'expression':expr,'instances':T if kind=='max_open' else 1 if kind=='switch_budget' else G*max(0,T-1) if kind=='ramp' else C*T})
    if x['s']['security']=='N-1':formulas.append({'id':'N-1','name':'故障场景扩展','expression':'gᶜ(xᶜ)=0，hᶜ(xᶜ)≤0，∀c∈Cₙ₋₁','instances':None})
    objective_names={'redispatch':'Σg,t |Pɢ,ₜ−Pɢ,₀| Δt','voltage_deviation':'Σi,t (Vᵢ,ₜ−1)² Δt','economy':'Σg,t Cɢ(Pɢ,ₜ) Δt','reliability':'Φ_N−1(x) · 风险与安全裕度项','renewable':'Σg∈Gᴿ,t (Pavailableɢ,ₜ−Pɢ,ₜ) Δt','line_loading':'Σl,t |Sˡ,ₜ|/Smaxˡ'}
    objective='min F = '+' + '.join(str(o['weight'])+' · ['+objective_names[o['kind']]+']' for o in x['s']['objectives'] if o['weight']>0)
    code='import json\nfrom pathlib import Path\nfrom model_backend import build_model\n\ncase = json.loads(Path("data/case905.json").read_text(encoding="utf-8"))\nspec = json.loads(Path("model-spec.json").read_text(encoding="utf-8"))\nmodel = build_model(case, spec)\n'
    return {'spec':x,'spec_hash':fingerprint(x),'changes':changed_rows(x),'variables':variables,'objective':objective,'formulas':formulas,'scale':{'integer':sum(integer.values()),'integer_breakdown':integer,'continuous':sum(v['size'] for v in variables if v['domain']=='连续'),'base_constraint_instances':sum(f['instances'] or 0 for f in formulas),'security_expanded':False,'switch_candidates':C},'code':code,'code_language':'Python / Pyomo','status':'draft'}

def validation(spec):
    x=normalize(spec);rows=[]
    def add(layer,status,title,detail='',objects=None):rows.append({'id':'V'+str(len(rows)+1),'layer':layer,'status':status,'title':title,'detail':detail,'objects':objects or []})
    add('规格合法','pass','对象与字段检查通过',str(len(x['delta_pi']))+' 项参数修改')
    unresolved=[p for p in x['delta_pi'] if p['value'] is None]
    add('规格合法','block' if unresolved else 'pass','参数赋值完整性','待确认 '+str(len(unresolved))+' 项',[p['entity_id'] for p in unresolved])
    add('规格合法','pass','905节点数据版本一致')
    bound_conflicts=set()
    for t in range(1,x['R']['periods']+1):
        changed={}
        for patch in x['delta_pi']:
            if patch['value'] is None or not patch['time_from']<=t<=patch['time_to']:continue
            oid=patch['entity_id'];changed.setdefault(oid,dict(ENTITIES[oid]['raw']));changed[oid][patch['field']]=patch_value(ENTITIES[oid]['raw'][patch['field']],patch)
        for oid,values in changed.items():
            for lo,hi in [('PMIN','PMAX'),('QMIN','QMAX'),('VMIN','VMAX')]:
                if lo in values and hi in values and values[lo]>values[hi]:bound_conflicts.add((oid,lo,hi))
    for oid,lo,hi in sorted(bound_conflicts):add('规格合法','block','上下限冲突',oid+' '+lo+' > '+hi,[oid])
    disconnected=set()
    for t in range(1,x['R']['periods']+1):
        openids={p['entity_id'] for p in x['delta_pi'] if p['field']=='BR_STATUS' and p['value'] is not None and p['time_from']<=t<=p['time_to'] and patch_value(ENTITIES[p['entity_id']]['raw']['BR_STATUS'],p)==0}
        adj=defaultdict(list)
        for e in CASE['branches']:
            if e['status']==1 and e['id'] not in openids:adj[e['from']].append(e['to']);adj[e['to']].append(e['from'])
        seen=set();ncomp=0
        for bus in CASE['buses']:
            if bus['id'] in seen:continue
            ncomp+=1;stack=[bus['id']];seen.add(bus['id'])
            while stack:
                for v in adj[stack.pop()]:
                    if v not in seen:seen.add(v);stack.append(v)
        if ncomp>CASE['counts']['components']:disconnected.update(openids)
    add('结构一致','block' if disconnected else 'pass','固定开断连通性','造成解列' if disconnected else '未发现新增连通分量',sorted(disconnected))
    bridgec=[oid for oid in candidate_ids(x) if ENTITIES[oid]['bridge']]
    add('结构一致','warn' if bridgec else 'pass','开断候选检查',str(len(bridgec))+' 条桥支路进入候选集',bridgec)
    for q in CASE['quality'][:6]:add('数据检查','warn' if q['count'] and q['severity']=='warning' else 'info',q['label'],str(q['count'])+' '+q['unit'],q['objects'])
    if x['R']['rate_zero_policy']=='pending':add('数据检查','block','5条零容量支路的约束策略待确认','选择未给额定值或闭锁，不修改原始数据',[q['id'] for q in CASE['branches'] if q['rate']==0])
    if x['omega']['base_model']=='AC-OPF' and x['R']['b_convention']=='pending':add('数据检查','block','支路充电电纳口径待确认','选择总电纳或每端电纳')
    for o in x['s']['objectives']:
        if o['weight']>0 and o['kind'] in ['economy','renewable']:add('数据检查','block','目标数据待补充','发电成本系数' if o['kind']=='economy' else '新能源标识与可用出力')
        if o['weight']>0 and o['kind']=='reliability' and x['s']['security']!='N-1':add('结构一致','block','可靠性目标需要N−1安全场景','先启用N−1结构扩展')
        if o['weight']>0 and o['kind']=='reliability' and x['s']['security']=='N-1':add('可执行','not_run','可靠性目标待黑盒场景构建','N−1风险项由独立求解服务计算')
        if o['weight']>0 and o['kind']=='voltage_deviation' and x['omega']['base_model']=='DC-OPF':add('结构一致','block','直流模型不包含电压幅值变量','切换基础模型或目标项')
    code=compile_spec(x)['code'];ast.parse(code);add('可执行','pass','Python语法检查通过')
    add('可执行','not_run','求解器构建检查','由黑盒后端返回')
    source=x.get('prompt','')+'\n'+str(x.get('clarifications',''))
    for p in x['delta_pi']:
        valid=bool(p.get('source')) and p['source'] in source
        add('语义回译','pass' if valid else 'block',p['entity_id']+'.'+p['field']+' 修改来源',p.get('source','缺少原文'),[p['entity_id']])
        if valid and p['value'] is not None:
            expected=next((a for a in analyze(p['source'])['delta_pi'] if a['entity_id']==p['entity_id'] and a['field']==p['field'] and a['value'] is not None),None)
            if expected:
                same=expected['operation']==p['operation'] and math.isclose(expected['value'],p['value'],rel_tol=1e-9,abs_tol=1e-9)
                add('语义回译','pass' if same else 'block',p['entity_id']+'.'+p['field']+' 数值回译','与原文一致' if same else '修改操作或数值与原文不一致',[p['entity_id']])
            else:add('语义回译','warn',p['entity_id']+'.'+p['field']+' 量化关系待核对','原文未匹配明确数值表达',[p['entity_id']])

    if not x['delta_pi']:add('语义回译','info','当前模型没有参数补丁')
    if x['s']['security']=='N-1':add('可执行','not_run','N−1场景构建与校核','等待求解接口')
    count=CounterLocal(rows)
    return {'spec_hash':fingerprint(x),'rows':rows,'counts':count,'status':'blocked' if count['block'] else 'review' if count['warn'] else 'ready'}
def CounterLocal(rows):return {k:sum(r['status']==k for r in rows) for k in ['pass','warn','block','info','not_run']}

def risk_simulation(spec,level='高'):
    x=normalize(spec)
    if level not in ['低','中','高','严重']:raise ValueError('风险等级无效')
    proposals=[]
    if 'OTS' in x['s']['types']:proposals.append({'id':'R1','title':'将桥支路加入不可开断集合','kind':'protect_bridges','value':[l['id'] for l in CASE['branches'] if l['bridge']],'decision':'pending'})
    proposals.append({'id':'R2','title':'提高电压偏移目标权重','kind':'voltage_weight','value':2.0,'decision':'pending'})
    return {'mode':'本地规则模拟','level':level,'spec_hash':fingerprint(x),'proposals':proposals,'reward_map':{'低':0,'中':-.3,'高':-1,'严重':-2}}

def apply_risk(spec,report,accepted):
    x=normalize(spec)
    if report.get('spec_hash')!=fingerprint(x):raise ValueError('风险意见对应旧版本')
    if not isinstance(accepted,list):raise ValueError('请选择协商建议')
    proposals={p['id']:p for p in report.get('proposals',[])}
    for pid in accepted:
        if pid not in proposals:raise ValueError('建议不存在')
        p=proposals[pid]
        if p['kind']=='protect_bridges':x['s']['protected_branches']=list(dict.fromkeys(x['s'].get('protected_branches',[])+p['value']))
        elif p['kind']=='voltage_weight':
            if x['omega']['base_model']!='AC-OPF':raise ValueError('电压目标不适用于直流模型')
            found=next((o for o in x['s']['objectives'] if o['kind']=='voltage_deviation'),None)
            if found:found['weight']=p['value']
            else:x['s']['objectives'].append({'kind':'voltage_deviation','weight':p['value']})
        else:raise ValueError('建议类型尚未实现')
    return normalize(x)

def evaluate_cases(cases):
    if not isinstance(cases,list) or not 1<=len(cases)<=300:raise ValueError('测试集需包含1—300条指令')
    rows=[]
    for i,c in enumerate(cases):
        prompt=c.get('prompt');expected=c.get('expected_level');spec=analyze(prompt)
        patches=spec['delta_pi'];hallucinations=sum(p['entity_id'] not in ENTITIES or not p.get('source') or p['source'] not in prompt for p in patches)
        rows.append({'id':str(c.get('id',i+1)),'expected_level':expected,'predicted_level':spec['level'],'correct':spec['level']==expected if expected in LEVELS else None,'hallucinations':hallucinations,'unresolved_objects':sum(m['kind']=='object' for m in spec['missing_information']),'parameter_count':len(patches),'mode':'规则解析','prompt':prompt})
    stats=[]
    for l in LEVELS:
        rs=[r for r in rows if r['expected_level']==l];stats.append({'level':l,'labelled':len(rs),'correct':sum(r['correct'] for r in rs),'accuracy':sum(r['correct'] for r in rs)/len(rs) if rs else None,'hallucinations':sum(r['hallucinations'] for r in rs)})
    return {'mode':'规则判级测评','rows':rows,'by_level':stats,'total':len(rows),'labelled':sum(r['correct'] is not None for r in rows)}
