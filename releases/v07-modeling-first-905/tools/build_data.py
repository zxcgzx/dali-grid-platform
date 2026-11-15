from __future__ import annotations
import csv, io, json, re, sys, hashlib, math, shutil
from pathlib import Path
from zipfile import ZipFile
from collections import Counter, defaultdict
import numpy as np
from scipy.io import loadmat
ROOT=Path(__file__).resolve().parents[1]
sys.setrecursionlimit(10000)
def clean(x):
    if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
    if isinstance(x,(list,tuple,np.ndarray)):return [clean(v) for v in x]
    if isinstance(x,(float,np.floating)):return round(float(x),8) if math.isfinite(float(x)) else None
    if isinstance(x,np.integer):return int(x)
    return x
def write(name,x):
    p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(clean(x),ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
def bridges(nodes,edges):
    adj=defaultdict(list)
    for e in edges:
        if e['status']==1:adj[e['from']].append((e['to'],e['id']));adj[e['to']].append((e['from'],e['id']))
    tin={};low={};res=[];clock=0;components=[]
    def dfs(u,parent,comp):
        nonlocal clock
        tin[u]=low[u]=clock;clock+=1;comp.append(u)
        for v,eid in adj[u]:
            if eid==parent:continue
            if v in tin:low[u]=min(low[u],tin[v])
            else:
                dfs(v,eid,comp);low[u]=min(low[u],low[v])
                if low[v]>tin[u]:res.append(eid)
    for n in nodes:
        if n['id'] not in tin:
            comp=[];dfs(n['id'],None,comp);components.append(comp)
    return set(res),components

def main():
    source=Path(sys.argv[1]);old=ROOT.parent/'v051-platform-a'
    (ROOT/'data').mkdir(parents=True,exist_ok=True)
    with ZipFile(source) as z:
        rawname=next(n for n in z.namelist() if '/dali_matlab_v1.3/' in n and n.endswith('/pasExp_20261004_153500_1.txt'))
        raw=z.read(rawname);text=raw.decode('utf-8-sig');sha=hashlib.sha256(raw).hexdigest()
        (ROOT/'data'/'snapshot905.txt').write_bytes(raw)
        def section(key):
            block=re.search(r'#####Begin Matrix '+key+r'#####\s*\n(.*?)#####End Matrix '+key+r'#####',text,re.S)
            if not block:raise ValueError('Missing '+key)
            return [{k:float(v) for k,v in row.items()} for row in csv.DictReader(io.StringIO(block[1].strip()))]
        b,g,l=section('Bus'),section('Gen'),section('Branch')
        buses=[dict(id='B'+str(int(x['BUS_I'])),row=i+1,bus_i=int(x['BUS_I']),type=int(x['BUS_TYPE']),pd=x['PD'],qd=x['QD'],vm=x['VM'],va=x['VA'],kv=x['BASE_KV'],vmin=x['VMIN'],vmax=x['VMAX'],renewable=x['RENEWABLE'],raw=x) for i,x in enumerate(b)]
        gens=[dict(id='G'+str(i+1),row=i+1,bus='B'+str(int(x['GEN_BUS'])),pg=x['PG'],qg=x['QG'],pmin=x['PMIN'],pmax=x['PMAX'],qmin=x['QMIN'],qmax=x['QMAX'],status=int(x['GEN_STATUS']),raw=x) for i,x in enumerate(g)]
        busmap={x['id']:x for x in buses}
        lines=[]
        for i,x in enumerate(l):
            f,t='B'+str(int(x['F_BUS'])),'B'+str(int(x['T_BUS']))
            lines.append(dict(id='L'+str(i+1),row=i+1,**{'from':f,'to':t},r=x['BR_R'],x=x['BR_X'],b=x['BR_B'],rate=x['RATE_A'],tap=x['TAP'],shift=x['SHIFT'],status=int(x['BR_STATUS']),pf=x['PF'],qf=x['QF'],pt=x['PT'],qt=x['QT'],kv=max(busmap[f]['kv'],busmap[t]['kv']),low_kv=min(busmap[f]['kv'],busmap[t]['kv']),loading_pct=max(math.hypot(x['PF'],x['QF']),math.hypot(x['PT'],x['QT']))/x['RATE_A']*100 if x['RATE_A']>0 else None,raw=x))
        bridge,components=bridges(buses,lines)
        for e in lines:e['bridge']=e['id'] in bridge
        pairs=Counter(tuple(sorted((e['from'],e['to']))) for e in lines)
        multigens=Counter(e['bus'] for e in gens)
        issues=[dict(id='vm_high',label='电压高于上限',severity='warning',unit='母线',objects=[x['id'] for x in buses if x['vm']>x['vmax']]),dict(id='vm_low',label='电压低于下限',severity='warning',unit='母线',objects=[x['id'] for x in buses if x['vm']<x['vmin']]),dict(id='pg_bounds',label='机组有功超出上下限',severity='warning',unit='机组',objects=[x['id'] for x in gens if not x['pmin']<=x['pg']<=x['pmax']]),dict(id='rate_zero',label='线路容量为零',severity='warning',unit='支路',objects=[x['id'] for x in lines if x['rate']==0]),dict(id='negative_load',label='负负荷',severity='info',unit='母线',objects=[x['id'] for x in buses if x['pd']<0]),dict(id='equivalent',label='B176等值机组',severity='info',unit='机组',objects=[x['id'] for x in gens if x['bus']=='B176']),dict(id='cost_missing',label='发电成本待补充',severity='warning',unit='机组',objects=[x['id'] for x in gens]),dict(id='renewable_missing',label='新能源标识待补充',severity='warning',unit='数据项',objects=[])]
        for x in issues:x['count']=len(x['objects'])
        data=dict(schema_version='905.1',case_id='DALI905',name='905节点统一断面',snapshot_name='pasExp_20261004_153500_1.txt',snapshot_time=re.search(r'time\s*=\s*(.*)',text)[1],sha256=sha,base_mva=100,angle_unit='rad',power_unit='MW/Mvar/MVA',buses=buses,generators=gens,branches=lines,coordinates=[],coordinate_system=None,quality=issues,counts=dict(buses=len(b),generators=len(g),branches=len(l),bridges=len(bridge),mesh=len(lines)-len(bridge),mesh110=sum(not e['bridge'] and e['kv']>=110 for e in lines),parallel_groups=sum(c>1 for c in pairs.values()),multi_gen_buses=sum(c>1 for c in multigens.values()),components=len(components)),summary=dict(pd_mw=sum(x['pd'] for x in buses),pg_mw=sum(x['pg'] for x in gens),slack=[x['id'] for x in buses if x['type']==3],voltage_levels=sorted(set(x['kv'] for x in buses),reverse=True)),source_series_mode='single_snapshot')
        write('data/case905.json',data)
        # A deterministic network layout is stored separately from geographic coordinates.
        try:
            import networkx as nx
            graph=nx.Graph();graph.add_nodes_from(busmap);graph.add_edges_from((e['from'],e['to']) for e in lines)
            pos=nx.spring_layout(graph,seed=905,iterations=85,scale=1)
        except ImportError:
            pos={x['id']:(math.cos(i*2*math.pi/len(b)),math.sin(i*2*math.pi/len(b))) for i,x in enumerate(buses)}
        write('data/topology905.json',dict(kind='electrical_layout',positions={k:[float(v[0]),float(v[1])] for k,v in pos.items()}))
        prefix=rawname.rsplit('/',1)[0]+'/speed_E0_none/'
        m=loadmat(io.BytesIO(z.read(prefix+'MPAC_solutions.mat')),simplify_cells=True)
        periods=list(csv.DictReader(io.StringIO(z.read(prefix+'MPAC_periods.csv').decode('utf-8-sig'))))
        result=dict(schema_version='905-result.1',units={'angle':'rad','active_power':'MW','reactive_power':'Mvar','voltage':'p.u.'},id='ARCHIVE-ACOTS-20261105',case_id='DALI905',data_sha256=sha,origin='archive',title='16时段AC-OTS已有案例',solver='MATPOWER / MIPS',model_scope='AC-OTS · 14条单开断候选',series_mode='synthetic_profile',series_label='合成负荷曲线 1.00→1.08',period_minutes=15,source_profile='equivalent_v1 / taskbook_proxy',candidate_ids=['L'+str(int(v)) for v in m['cand']],bus_ids=[x['id'] for x in buses],generator_ids=[x['id'] for x in gens],periods=[],n1_scope='≥110 kV非桥支路；静态交流校验',source_notes=['输入原始断面与计算等值算例分别保存','已有案例使用合成负荷曲线','支路基态潮流未在本结果文件中提供'])
        for t,row in enumerate(periods):
            k=int(m['path'][t])-1;op=int(row['open_row']);entries={key:(float(v) if v not in ('PASS','FAIL','UNKNOWN') else v) for key,v in row.items()}
            def state(col):return dict(vm=m['VM'][t,col].tolist(),va=(m['VA'][t,col]*math.pi/180).tolist(),pg=m['PG'][t,col].tolist(),qg=m['QG'][t,col].tolist(),objective=float(m['J'][t,col]))
            p=dict(t=t+1,load_factor=float(m['lam'][t]),open_branches=['L'+str(op)] if op else [],before=state(0),after=state(k),recorded=entries)
            for key,pattern in [('n1_after',f'n1_detail_MPAC_t{t+1:02d}_open_{op}.csv'),('n1_before',f'n1_detail_MPAC_t{t+1:02d}_no_opening_sc1.csv')]:
                fn=prefix+pattern
                if fn not in z.namelist():
                    candidates=[n for n in z.namelist() if n.startswith(prefix+f'n1_detail_MPAC_t{t+1:02d}_no_opening')];fn=candidates[0] if candidates else ''
                if fn:
                    records=list(csv.DictReader(io.StringIO(z.read(fn).decode('utf-8-sig'))))
                    details=[dict(element='L'+r['element_row'],converged=r['converged']=='1',strict=r['pass_strict']=='1',incremental=r['pass_incremental']=='1',emergency=r['pass_emergency']=='1',reason=r.get('fail_reason',''),max_loading_pct=float(r['max_loading_pct']) if r['max_loading_pct'] not in ('NaN','') else None) for r in records]
                    p[key]=dict(total=len(details),converged=sum(v['converged'] for v in details),strict=sum(v['strict'] for v in details),incremental=sum(v['incremental'] for v in details),emergency=sum(v['emergency'] for v in details),details=details)
            result['periods'].append(p)
        write('data/reference_result.json',result)
        docs=ROOT/'docs';docs.mkdir(exist_ok=True);(docs/'计算案例口径.md').write_bytes(z.read(prefix+'MPAC_report.md'))
    for folder in ['partners-official','geography']:
        src=old/'assets'/folder;dst=ROOT/'assets'/folder
        if not dst.exists():shutil.copytree(src,dst)
    write('data/catalog.json',[{k:result[k] for k in ['id','title','solver','series_label','model_scope','origin']}])
    print(json.dumps(dict(case=data['counts'],quality={i['id']:i['count'] for i in issues},sha256=sha,result_periods=len(result['periods']),first_open=result['periods'][0]['open_branches'],coordinate_count=0),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
