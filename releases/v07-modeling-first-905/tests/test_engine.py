from __future__ import annotations
import ast,base64,copy,hashlib,io,json,sys,threading,urllib.request,urllib.error,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import engine
from model_backend import build_summary
from server import create_server,validate_result
CHECKS=[]
def check(name,value):
    if not value:raise AssertionError(name)
    CHECKS.append(name);print('PASS '+name,flush=True)
def bad(name,fn):
    try:fn()
    except (ValueError,TypeError,KeyError):CHECKS.append(name);print('PASS '+name,flush=True);return
    raise AssertionError(name)
def patch(oid,f,v,op='set',start=1,end=16,source=''):
    return dict(id='P'+oid+f,entity_id=oid,field=f,value=v,operation=op,direction=None,unit=engine.FIELDS[oid[0]][f],time_from=start,time_to=end,source=source)
case=engine.CASE
check('canonical counts',case['counts']['buses']==905 and case['counts']['generators']==237 and case['counts']['branches']==1000)
check('raw snapshot SHA',hashlib.sha256((ROOT/'data/snapshot905.txt').read_bytes()).hexdigest()==case['sha256'])
check('source package retained',(ROOT/'data/source/905节点计算.zip').stat().st_size>70_000_000)
manifest=json.loads((ROOT/'data/source_manifest.json').read_text(encoding='utf-8'))
check('source snapshot matches unified data',manifest['raw_snapshot']['sha256']==case['sha256'])
check('noncontiguous bus IDs',len(set(b['bus_i'] for b in case['buses']))==905 and max(b['bus_i'] for b in case['buses'])==4588)
check('row branch IDs',all(l['id']=='L'+str(i+1) for i,l in enumerate(case['branches'])))
check('parallel groups preserved',case['counts']['parallel_groups']==67)
check('multi generator buses preserved',case['counts']['multi_gen_buses']==61)
check('bridge candidate counts',case['counts']['bridges']==775 and case['counts']['mesh']==225 and case['counts']['mesh110']==107)
check('quality unchanged',[q['count'] for q in case['quality'][:5]]==[231,2,101,5,248])
check('angle radians',case['angle_unit']=='rad')
check('no fabricated coordinates',case['coordinates']==[])
for scenario in engine.SCENARIOS:
    x=engine.analyze(scenario['prompt']);check(scenario['id']+' level',x['level']==scenario['level']);engine.compile_spec(x)
x=engine.analyze(engine.SCENARIOS[1]['prompt']);check('inferred value not assigned',x['delta_pi'][0]['value'] is None and len(x['missing_information'])==1)
x=engine.analyze('持续高温导致输电线路热稳定裕度下降，保持模型结构不变。')
check('scenario inference asks for target line',x['level']=='L2' and any(m['kind']=='target' for m in x['missing_information']) and x['delta_pi']==[])
x=engine.analyze('高温导致输电线路热稳定裕度下降，请扩展为OTS并允许线路开断。')
check('semantic plus structural inference is L4',x['level']=='L4' and any(m['kind']=='target' for m in x['missing_information']))
x=engine.analyze('将母线B999999的有功负荷提高10%。');check('unknown kept in questions',any('B999999' in m['question'] for m in x['missing_information']));bad('unknown object rejected at compile',lambda:engine.compile_spec(x))
x=engine.default_spec();x['delta_pi']=[patch('G1','PMAX',float('nan'))];bad('NaN rejected',lambda:engine.normalize(x))
x=engine.default_spec();x['delta_pi']=[patch('G1','PMAX',5),patch('G1','PMAX',7)];bad('overlapping patches rejected',lambda:engine.normalize(x))
x=engine.default_spec();x['delta_pi']=[patch('G1','PMAX',5)];x['delta_pi'][0]['unit']='rad';bad('unit mismatch rejected',lambda:engine.normalize(x))
x=engine.default_spec();x['delta_pi']=[patch('G1','PMIN',3),patch('G1','PMAX',2)];check('combined bounds conflict',any(r['title']=='上下限冲突' for r in engine.validation(x)['rows']))
x=engine.analyze(engine.SCENARIOS[0]['prompt']);x['delta_pi'][0]['value']=1.2;check('numeric semantic mismatch blocked',any(r['status']=='block' and '数值回译' in r['title'] for r in engine.validation(x)['rows']))
x=engine.default_spec();bridge=next(l['id'] for l in case['branches'] if l['bridge']);x['delta_pi']=[patch(bridge,'BR_STATUS',0)];check('islanding detected',any(r['title']=='固定开断连通性' and r['status']=='block' for r in engine.validation(x)['rows']))
x=engine.default_spec();x['s']['types']=['OPF','OTS','DISPATCH','UC'];comp=engine.compile_spec(x);check('integer variable count',comp['scale']['integer']==14976 and comp['scale']['integer_breakdown']['机组状态 u']==3792)
x['R']['candidate_scope']='all';check('all line states 16000',engine.compile_spec(x)['scale']['integer_breakdown']['线路状态 z']==16000)
x['R']['candidate_scope']='mesh110';check('high voltage mesh line states 1712',engine.compile_spec(x)['scale']['integer_breakdown']['线路状态 z']==1712)
x=engine.default_spec();x['s']['objectives']=[{'kind':'economy','weight':1}];check('missing economy data blocked',any(r['title']=='目标数据待补充' and r['status']=='block' for r in engine.validation(x)['rows']))
x['s']['objectives']=[{'kind':'reliability','weight':1}];check('reliability requires N-1',any(r['title']=='可靠性目标需要N−1安全场景' for r in engine.validation(x)['rows']))
x['s']['security']='N-1';check('N-1 remains a black-box expansion',any(r['title']=='N−1场景构建与校核' and r['status']=='not_run' for r in engine.validation(x)['rows']))
x=engine.default_spec();x['R'].update(rate_zero_policy='unlimited',b_convention='per_end');built=build_summary(case,x);check('AC model structure builds without solver',built['status']=='built' and built['constraints']>8000 and not built['solver_called'])
x['s']['security']='N-1';notrun=build_summary(case,x);check('N-1 model build is not misreported',notrun['status']=='not_run' and not notrun['solver_called'])
check('local optimization function removed',not hasattr(__import__('model_backend'),'solve_linear'))
check('HiGHS not advertised as local solver','HiGHS' not in (ROOT/'views.js').read_text(encoding='utf-8'))
risk_spec=engine.analyze(engine.SCENARIOS[2]['prompt']);report=engine.risk_simulation(risk_spec);changed=engine.apply_risk(risk_spec,report,['R1']);check('risk returns protected branches',len(changed['s']['protected_branches'])==775)
bad('old risk fingerprint rejected',lambda:engine.apply_risk({**risk_spec,'R':{**risk_spec['R'],'periods':17}},report,['R1']))
arch=json.loads((ROOT/'data/reference_result.json').read_text(encoding='utf-8'));validate_result(arch)
check('archive 16 periods and real dimensions',len(arch['periods'])==16 and len(arch['periods'][15]['after']['vm'])==905 and len(arch['periods'][15]['after']['pg'])==237)
check('archive separate from single snapshot',arch['origin']=='archive' and arch['series_mode']=='synthetic_profile')
check('N1 criteria separate',arch['periods'][0]['n1_after']['total']==106 and arch['periods'][0]['n1_after']['strict']==0 and arch['periods'][0]['n1_after']['emergency']==102)
a=copy.deepcopy(arch);a['data_sha256']='wrong';bad('result hash mismatch',lambda:validate_result(a))
a=copy.deepcopy(arch);a['periods'][0]['after']['pg']=[1];bad('result dimension mismatch',lambda:validate_result(a))
a=copy.deepcopy(arch);a['periods'][0]['open_branches']=['L1001'];bad('result unknown line',lambda:validate_result(a))
evalr=engine.evaluate_cases([{'id':c['id'],'prompt':c['prompt'],'expected_level':c['level']} for c in engine.SCENARIOS]+[{'id':'unlabelled','prompt':engine.SCENARIOS[0]['prompt']}]);check('evaluation denominator labelled only',evalr['total']==5 and evalr['labelled']==4 and all(x['accuracy']==1 for x in evalr['by_level']))
srv=create_server(0);thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{srv.server_port}'
try:
    token=json.load(urllib.request.urlopen(base+'/api/session'))['token']
    def post(route,body,auth=True):
        req=urllib.request.Request(base+route,data=json.dumps(body).encode(),headers={'Content-Type':'application/json',**({'X-Platform-Token':token} if auth else {})});return json.load(urllib.request.urlopen(req,timeout=120))
    def denied(label,route,body,code,auth=True):
        try:post(route,body,auth)
        except urllib.error.HTTPError as e:check(label,e.code==code);return
        raise AssertionError(label)
    denied('write token protection','/api/compile',{'spec':engine.default_spec()},403,False)
    denied('local solve endpoint disabled','/api/solve',{'spec':engine.default_spec(),'spec_hash':'wrong'},501)
    denied('private proxy denied by default','/api/proxy',{'service':'primary','url':'http://127.0.0.1:1/x','payload':{}},400)
    denied('unknown service rejected','/api/proxy',{'service':'unknown','url':'https://example.invalid','payload':{}},400)
    denied('missing geographic coordinates rejected','/api/coordinates',{'crs':'GCJ02','points':[{'id':'B175','lon':None,'lat':None}]},400)
    coord=post('/api/coordinates',{'crs':'GCJ02','points':[{'id':'B175','lon':100.2,'lat':25.7}]});check('user supplied coordinate import',coord['count']==1)
    pkg=post('/api/model/package',{'spec':engine.default_spec()});raw=base64.b64decode(pkg['content_base64']);z=zipfile.ZipFile(io.BytesIO(raw));check('self contained model package',all(name in z.namelist() for name in ['engine.py','model_backend.py','build.py','data/case905.json','model-spec.json']));ast.parse(z.read('build.py'))
    check('code check endpoint does not execute code',post('/api/code/check',{'source':'raise RuntimeError("not executed")'})['status']=='pass')
finally:srv.shutdown();srv.server_close();thread.join(timeout=3)
print('FINAL passed '+str(len(CHECKS)))
