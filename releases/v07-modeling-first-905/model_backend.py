from __future__ import annotations
import math, time

def build_model(case, spec):
    import pyomo.environ as p
    from engine import normalize, patch_value, candidate_ids
    spec=normalize(spec);R=spec['R'];ac=spec['omega']['base_model']=='AC-OPF';T=R['periods'];uc='UC' in spec['s']['types'];cand=candidate_ids(spec)
    if any(v['value'] is None for v in spec['delta_pi']):raise ValueError('参数调整幅度尚未确认')
    if R['rate_zero_policy']=='pending':raise ValueError('请确认零容量支路策略')
    if ac and R['b_convention']=='pending':raise ValueError('请确认支路电纳口径')
    if spec['s']['security']=='N-1':raise ValueError('N−1场景模型由专业求解接口构建')
    if any(o['kind'] in ['economy','renewable'] and o['weight']>0 for o in spec['s']['objectives']):raise ValueError('目标函数缺少成本或新能源数据')
    if any(o['kind']=='reliability' and o['weight']>0 for o in spec['s']['objectives']):raise ValueError('可靠性目标需由N−1黑盒服务构建')
    if not ac and any(o['kind']=='voltage_deviation' and o['weight']>0 for o in spec['s']['objectives']):raise ValueError('直流模型不含电压幅值')
    if any(o['kind']=='line_loading' and o['weight']>0 for o in spec['s']['objectives']):raise ValueError('线路负载率目标由专业求解接口构建')
    bs={v['id']:v for v in case['buses']};gs={v['id']:v for v in case['generators']};es={v['id']:v for v in case['branches']};objects={**bs,**gs,**es}
    patches={(d['entity_id'],d['field'],t):d for d in spec['delta_pi'] for t in range(d['time_from'],d['time_to']+1)}
    def val(oid,f,t):
        v=objects[oid]['raw'][f];d=patches.get((oid,f,t));return patch_value(v,d) if d else v
    m=p.ConcreteModel('DALI905');m.N=p.Set(initialize=list(bs));m.G=p.Set(initialize=list(gs));m.E=p.Set(initialize=list(es));m.C=p.Set(initialize=cand);m.T=p.RangeSet(1,T)
    m.theta=p.Var(m.N,m.T,bounds=(-math.pi,math.pi));m.pg=p.Var(m.G,m.T);m.pf=p.Var(m.E,m.T);m.pt=p.Var(m.E,m.T)
    if ac:m.vm=p.Var(m.N,m.T,bounds=lambda _,i,t:(val(i,'VMIN',t),val(i,'VMAX',t)));m.qg=p.Var(m.G,m.T);m.qf=p.Var(m.E,m.T);m.qt=p.Var(m.E,m.T)
    m.z=p.Var(m.C,m.T,domain=p.Binary)
    if uc:m.u=p.Var(m.G,m.T,domain=p.Binary);m.start=p.Var(m.G,m.T,domain=p.Binary);m.stop=p.Var(m.G,m.T,domain=p.Binary)
    m.cons=p.ConstraintList()
    def z(e,t):return m.z[e,t] if e in m.C else val(e,'BR_STATUS',t)
    def u(g,t):return m.u[g,t] if uc else val(g,'GEN_STATUS',t)
    for t in m.T:
        for g in gs:
            m.cons.add(m.pg[g,t]>=val(g,'PMIN',t)*u(g,t));m.cons.add(m.pg[g,t]<=val(g,'PMAX',t)*u(g,t))
            if ac:m.cons.add(m.qg[g,t]>=val(g,'QMIN',t)*u(g,t));m.cons.add(m.qg[g,t]<=val(g,'QMAX',t)*u(g,t))
            if uc:
                prev=m.u[g,t-1] if t>1 else gs[g]['status'];m.cons.add(m.u[g,t]-prev==m.start[g,t]-m.stop[g,t]);m.cons.add(m.start[g,t]+m.stop[g,t]<=1)
        for e,ed in es.items():
            i,j=ed['from'],ed['to'];r,x=val(e,'BR_R',t),val(e,'BR_X',t);tap=ed['tap'] or 1;shift=ed['shift']*math.pi/180;zz=z(e,t);rate=val(e,'RATE_A',t)
            if e in m.C and val(e,'BR_STATUS',t)==0:m.cons.add(m.z[e,t]==0)
            if r*r+x*x<=0:raise ValueError(e+' 阻抗为零')
            if ac:
                gg=r/(r*r+x*x);bb=-x/(r*r+x*x);bc=ed['b']*(2 if R['b_convention']=='per_end' else 1);vi,vj=m.vm[i,t],m.vm[j,t];a=m.theta[i,t]-m.theta[j,t]-shift
                m.cons.add(m.pf[e,t]==zz*case['base_mva']*(gg*vi**2/tap**2-vi*vj/tap*(gg*p.cos(a)+bb*p.sin(a))))
                m.cons.add(m.qf[e,t]==zz*case['base_mva']*(-(bb+bc/2)*vi**2/tap**2-vi*vj/tap*(gg*p.sin(a)-bb*p.cos(a))))
                m.cons.add(m.pt[e,t]==zz*case['base_mva']*(gg*vj**2-vi*vj/tap*(gg*p.cos(a)-bb*p.sin(a))))
                m.cons.add(m.qt[e,t]==zz*case['base_mva']*(-(bb+bc/2)*vj**2+vi*vj/tap*(gg*p.sin(a)+bb*p.cos(a))))
                if rate>0 or R['rate_zero_policy']=='blocked':m.cons.add(m.pf[e,t]**2+m.qf[e,t]**2<=(rate*zz)**2);m.cons.add(m.pt[e,t]**2+m.qt[e,t]**2<=(rate*zz)**2)
            else:
                if x==0:raise ValueError(e+' 电抗为零')
                coef=case['base_mva']/(x*tap);flow=coef*(m.theta[i,t]-m.theta[j,t]-shift)
                big=abs(coef)*(2*math.pi+abs(shift))
                if e in m.C:m.cons.add(m.pf[e,t]-flow<=big*(1-zz));m.cons.add(m.pf[e,t]-flow>=-big*(1-zz))
                else:m.cons.add(m.pf[e,t]==zz*flow)
                m.cons.add(m.pt[e,t]==-m.pf[e,t])
                lim=rate if rate>0 or R['rate_zero_policy']=='blocked' else big
                m.cons.add(m.pf[e,t]<=lim*zz);m.cons.add(m.pf[e,t]>=-lim*zz)
        for i,b in bs.items():
            generators=[g for g,v in gs.items() if v['bus']==i];out=[e for e,v in es.items() if v['from']==i];inc=[e for e,v in es.items() if v['to']==i]
            shunt=b['raw']['GS']*m.vm[i,t]**2 if ac else b['raw']['GS']
            m.cons.add(sum(m.pg[g,t] for g in generators)-val(i,'PD',t)==sum(m.pf[e,t] for e in out)+sum(m.pt[e,t] for e in inc)+shunt)
            if ac:m.cons.add(sum(m.qg[g,t] for g in generators)-val(i,'QD',t)==sum(m.qf[e,t] for e in out)+sum(m.qt[e,t] for e in inc)-b['raw']['BS']*m.vm[i,t]**2)
        m.cons.add(m.theta['B175',t]==0)
    constraints={c['kind']:c['value'] for c in spec['s'].get('constraints',[])}
    if 'max_open' in constraints and cand:
        for t in m.T:m.cons.add(sum(1-m.z[e,t] for e in cand)<=constraints['max_open'])
    if ('switch_budget' in constraints or 'min_hold' in constraints) and cand:
        m.action=p.Var(m.C,m.T,bounds=(0,1))
        for e in cand:
            for t in m.T:
                prev=m.z[e,t-1] if t>1 else es[e]['status'];m.cons.add(m.action[e,t]>=m.z[e,t]-prev);m.cons.add(m.action[e,t]>=prev-m.z[e,t])
                if 'min_hold' in constraints:
                    for tt in range(t,min(T,t+int(constraints['min_hold'])-1)+1):m.cons.add(m.z[e,tt]>=m.z[e,t]-prev);m.cons.add(1-m.z[e,tt]>=prev-m.z[e,t])
        if 'switch_budget' in constraints:m.cons.add(sum(m.action[e,t] for e in cand for t in m.T)<=constraints['switch_budget'])
    if 'ramp' in constraints:
        for g in gs:
            for t in m.T:
                prev=m.pg[g,t-1] if t>1 else gs[g]['pg'];m.cons.add(m.pg[g,t]-prev<=constraints['ramp']);m.cons.add(prev-m.pg[g,t]<=constraints['ramp'])
    terms=[]
    for o in spec['s']['objectives']:
        if o['weight']==0:continue
        if o['kind']=='redispatch':
            m.du=p.Var(m.G,m.T,domain=p.NonNegativeReals);m.dd=p.Var(m.G,m.T,domain=p.NonNegativeReals)
            for g in gs:
                for t in m.T:m.cons.add(m.pg[g,t]-gs[g]['pg']==m.du[g,t]-m.dd[g,t])
            terms.append(o['weight']*sum(m.du[g,t]+m.dd[g,t] for g in gs for t in m.T)*R['step_minutes']/60)
        elif o['kind']=='voltage_deviation':terms.append(o['weight']*sum((m.vm[i,t]-1)**2 for i in bs for t in m.T)*R['step_minutes']/60)
    if not terms:raise ValueError('没有可构建的目标项')
    m.objective=p.Objective(expr=sum(terms),sense=p.minimize)
    return m

def build_summary(case,spec):
    from engine import normalize
    spec=normalize(spec)
    if spec['s']['security']=='N-1':
        return {'status':'not_run','reason':'N−1场景由独立求解服务构建','variables':0,'integer':0,'continuous':0,'constraints':0,'solver_called':False}
    import pyomo.environ as p
    m=build_model(case,spec);vs=list(m.component_data_objects(p.Var));cs=list(m.component_data_objects(p.Constraint,active=True))
    return {'status':'built','variables':len(vs),'integer':sum(v.is_integer() for v in vs),'continuous':sum(not v.is_integer() for v in vs),'constraints':len(cs),'solver_called':False}

