"""Bounded four-node transport-switching MILP. No LLM code execution.
The 1 h period and fixed-cost billing basis are explicit demonstration additions.
This is not AC-OTS, DC power flow or an N-1 model.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROFILE = 'four-node-transport-switching-v1'
PAIRS = [(1, 2), (1, 4), (2, 3), (2, 4), (3, 4)]
PROMPT = '''请为四节点电网教学案例建立经济调度与线路开关优化模型。
采用无损运输网络近似：只使用节点有功平衡和线路容量，不使用相角潮流关系、无功、电压或N−1约束；不允许弃负荷。
调度时长明确为1小时，线路固定连接成本在本时段内按投运线路计费一次。
节点1、2的负荷为0；各有一台机组，最小出力均为0 MW，最大出力均为100 MW，发电成本分别为300元/MWh、500元/MWh。
节点3、4的固定负荷分别为50 MW、100 MW。
五条线路依次为L12=(1,2)、L14=(1,4)、L23=(2,3)、L24=(2,4)、L34=(3,4)，容量依次为50、50、100、100、100 MW，固定连接成本依次为50、50、50、150、50元/时段。
每条线路可接通或断开。接通时允许双向有功流，断开时流量必须为0；各线路正方向均为括号内第一个节点流向第二个节点。
以发电费用加投运线路固定连接费用最小为目标，给出机组出力、线路开关和线路流量。不要增加未提出的安全约束或提供未经计算的数值答案。'''


def default_spec() -> dict:
    return {'profile': PROFILE, 'duration_hours': 1.0,
            'nodes': [{'id': i, 'load_mw': v} for i, v in enumerate([0, 0, 50, 100], 1)],
            'generators': [{'id': 'G1', 'node': 1, 'pmin_mw': 0., 'pmax_mw': 100., 'cost_yuan_mwh': 300.},
                           {'id': 'G2', 'node': 2, 'pmin_mw': 0., 'pmax_mw': 100., 'cost_yuan_mwh': 500.}],
            'lines': [{'id': f'L{a}{b}', 'from': a, 'to': b, 'capacity_mw': cap, 'fixed_cost_yuan': price}
                      for (a, b), cap, price in zip(PAIRS, [50., 50., 100., 100., 100.], [50., 50., 50., 150., 50.])],
            'assumptions': {'network_model': 'lossless_transport', 'fixed_cost_basis': 'per_period_if_on',
                            'bidirectional': True, 'allow_load_shedding': False, 'n_minus_one': False}}


def _keys(x, keys, at):
    if not isinstance(x, dict) or set(x) != set(keys):
        raise ValueError(at + '字段必须为：' + ', '.join(keys))


def _number(x, at, lower=0, upper=1_000_000):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or not lower <= x <= upper:
        raise ValueError(at + f'必须为{lower}至{upper}之间的有限数值')
    return float(x)


def normalize(raw: dict) -> dict:
    _keys(raw, ['profile', 'duration_hours', 'nodes', 'generators', 'lines', 'assumptions'], '执行规格')
    if raw['profile'] != PROFILE: raise ValueError('该求解端点只支持四节点无损运输网络模板；其他模型不能静默降级')
    reference = default_spec()
    if (raw['assumptions'] != reference['assumptions'] or not isinstance(raw['assumptions'],dict) or any(type(raw['assumptions'].get(k)) is not type(v) for k,v in reference['assumptions'].items())): raise ValueError('模型假设不符；不支持交流、相角、弃负荷或N−1扩展')
    for key, size in [('nodes', 4), ('generators', 2), ('lines', 5)]:
        if not isinstance(raw[key], list) or len(raw[key]) != size: raise ValueError(key + '数量与模板不符')
    result = {'profile': PROFILE, 'duration_hours': _number(raw['duration_hours'], '时长', .01, 24)}
    nodes = []
    for row in raw['nodes']:
        _keys(row, ['id', 'load_mw'], '节点')
        if type(row['id']) is not int or row['id'] not in (1, 2, 3, 4): raise ValueError('节点编号必须为1至4的整数')
        nodes.append({'id': row['id'], 'load_mw': _number(row['load_mw'], '节点负荷')})
    if len({x['id'] for x in nodes}) != 4: raise ValueError('节点编号重复')
    result['nodes'] = sorted(nodes, key=lambda x: x['id'])
    gens = []
    for row in raw['generators']:
        _keys(row, ['id', 'node', 'pmin_mw', 'pmax_mw', 'cost_yuan_mwh'], '机组')
        if type(row['node']) is not int or row['node'] not in (1, 2) or row['id'] != 'G' + str(row['node']): raise ValueError('仅支持节点1的G1、节点2的G2')
        g = {'id': row['id'], 'node': row['node']}
        for k in ['pmin_mw', 'pmax_mw', 'cost_yuan_mwh']: g[k] = _number(row[k], k)
        if g['pmin_mw'] > g['pmax_mw']: raise ValueError('机组上下限倒置')
        gens.append(g)
    if len({x['id'] for x in gens}) != 2: raise ValueError('机组编号重复')
    result['generators'] = sorted(gens, key=lambda x: x['id'])
    lines = []
    for row in raw['lines']:
        _keys(row, ['id', 'from', 'to', 'capacity_mw', 'fixed_cost_yuan'], '线路')
        if type(row['from']) is not int or type(row['to']) is not int or (row['from'], row['to']) not in PAIRS or row['id'] != f"L{row['from']}{row['to']}": raise ValueError('线路编号、端点或方向与五条标准线路不符')
        lines.append({'id': row['id'], 'from': row['from'], 'to': row['to'], 'capacity_mw': _number(row['capacity_mw'], '线路容量'), 'fixed_cost_yuan': _number(row['fixed_cost_yuan'], '线路固定成本')})
    if len({x['id'] for x in lines}) != 5: raise ValueError('线路编号重复')
    result['lines'] = sorted(lines, key=lambda x: PAIRS.index((x['from'], x['to'])))
    result['assumptions'] = reference['assumptions']
    return result


def digest(spec):
    return hashlib.sha256(json.dumps(spec, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def schema():
    number = {'type': 'number', 'minimum': 0, 'maximum': 1000000}
    def obj(props): return {'type': 'object', 'properties': props, 'required': list(props), 'additionalProperties': False}
    def arr(item, n): return {'type': 'array', 'items': item, 'minItems': n, 'maxItems': n}
    spec = obj({'profile': {'const': PROFILE}, 'duration_hours': {'type': 'number', 'minimum': .01, 'maximum': 24},
                'nodes': arr(obj({'id': {'type': 'integer', 'enum': [1,2,3,4]}, 'load_mw': number}), 4),
                'generators': arr(obj({'id': {'type': 'string', 'enum': ['G1','G2']}, 'node': {'type': 'integer', 'enum': [1,2]}, 'pmin_mw': number, 'pmax_mw': number, 'cost_yuan_mwh': number}), 2),
                'lines': arr(obj({'id': {'type': 'string', 'enum': ['L12','L14','L23','L24','L34']}, 'from': {'type': 'integer'}, 'to': {'type': 'integer'}, 'capacity_mw': number, 'fixed_cost_yuan': number}), 5),
                'assumptions': obj({k: {'const': v} for k, v in default_spec()['assumptions'].items()})})
    return obj({'executable_spec': {'anyOf': [spec, {'type': 'null'}]}, 'missing_information': {'type': 'array', 'items': {'type': 'string'}}, 'unsupported_requirements': {'type': 'array', 'items': {'type': 'string'}}, 'mapping_evidence': {'type': 'array', 'items': obj({'field': {'type': 'string'}, 'quote': {'type': 'string'}})}})


def compile_spec(raw):
    s = normalize(raw)
    fmt = lambda x: f'{x:g}'
    objective = 'min ' + ' + '.join(f"{fmt(g['cost_yuan_mwh'] * s['duration_hours'])} P_{g['id']}" for g in s['generators'])
    objective += ' + ' + ' + '.join(f"{fmt(l['fixed_cost_yuan'])} z_{l['id']}" for l in s['lines'])
    balances = []
    for n in s['nodes']:
        terms = [f"P_{g['id']}" for g in s['generators'] if g['node'] == n['id']]
        terms += [f"+ f_{l['id']}" for l in s['lines'] if l['to'] == n['id']]
        terms += [f"- f_{l['id']}" for l in s['lines'] if l['from'] == n['id']]
        balances.append({'id': 'BAL-' + str(n['id']), 'expression': ' '.join(terms).lstrip('+ ') + ' = ' + fmt(n['load_mw']), 'name': f"节点{n['id']}有功平衡"})
    bounds = [{'id': 'GEN-' + g['id'], 'expression': f"{fmt(g['pmin_mw'])} ≤ P_{g['id']} ≤ {fmt(g['pmax_mw'])}", 'name': '机组出力边界'} for g in s['generators']]
    bounds += [{'id': 'LINE-' + l['id'], 'expression': f"-{fmt(l['capacity_mw'])} z_{l['id']} ≤ f_{l['id']} ≤ {fmt(l['capacity_mw'])} z_{l['id']}; z_{l['id']} ∈ {{0,1}}", 'name': '线路容量与开关联动'} for l in s['lines']]
    return {'template_version': PROFILE, 'spec': s, 'spec_sha256': digest(s), 'objective': objective,
            'variables': [{'symbol': 'P_G1, P_G2', 'domain': '连续', 'unit': 'MW', 'meaning': '机组有功出力'}, {'symbol': 'f_L12…f_L34', 'domain': '有符号连续', 'unit': 'MW', 'meaning': '按线路from→to为正方向'}, {'symbol': 'z_L12…z_L34', 'domain': '0/1', 'unit': '无量纲', 'meaning': '0断开，1投运'}],
            'constraints': balances + bounds, 'method': '经审核的限定模板编译；非执行任意LLM生成代码',
            'scope': '四节点无损运输网络MILP；非AC-OTS/DC潮流/N−1；固定成本按单时段计费'}


def solve(raw, expected_hash=None):
    import numpy as np
    import scipy
    from scipy.optimize import milp, Bounds, LinearConstraint
    s = normalize(raw)
    if expected_hash is not None and digest(s) != expected_hash: raise ValueError('执行规格已变化，请重新编译并确认')
    start = time.perf_counter()
    ng, nl, nb = 2, 5, 4
    c = np.array([g['cost_yuan_mwh'] * s['duration_hours'] for g in s['generators']] + [0.] * nl + [l['fixed_cost_yuan'] for l in s['lines']])
    balance = np.zeros((nb, ng + 2*nl))
    for j, g in enumerate(s['generators']): balance[g['node']-1, j] = 1
    limits = np.zeros((2*nl, len(c)))
    for j, l in enumerate(s['lines']):
        balance[l['from']-1, ng+j] = -1; balance[l['to']-1, ng+j] = 1
        limits[2*j, ng+j] = 1; limits[2*j, ng+nl+j] = -l['capacity_mw']
        limits[2*j+1, ng+j] = -1; limits[2*j+1, ng+nl+j] = -l['capacity_mw']
    loads = np.array([n['load_mw'] for n in s['nodes']])
    lo = [g['pmin_mw'] for g in s['generators']] + [-l['capacity_mw'] for l in s['lines']] + [0]*nl
    hi = [g['pmax_mw'] for g in s['generators']] + [l['capacity_mw'] for l in s['lines']] + [1]*nl
    r = milp(c, integrality=[0]*(ng+nl)+[1]*nl, bounds=Bounds(lo,hi), constraints=[LinearConstraint(balance,loads,loads),LinearConstraint(limits,-np.inf,0)], options={'time_limit':10., 'mip_rel_gap':0.})
    report = {'run_id': 'RUN-' + uuid.uuid4().hex[:12], 'computed_at': datetime.now(timezone.utc).isoformat(), 'spec_sha256':digest(s),
              'solver':'SciPy / HiGHS', 'scipy_version':scipy.__version__, 'status':{0:'optimal',1:'limit_reached',2:'infeasible',3:'unbounded'}.get(r.status,'error'),
              'duration_seconds':time.perf_counter()-start, 'message':str(r.message), 'real_computation':True, 'scope':compile_spec(s)['scope'],
              'objective_yuan':None, 'generation_cost_yuan':None, 'line_cost_yuan':None, 'generators':[], 'lines':[], 'checks':None}
    if r.x is None: return report
    p, f, z = r.x[:ng],r.x[ng:ng+nl],r.x[ng+nl:]
    # Independent numerical recomputation, not reuse of optimizer feasibility flag.
    residuals = []
    for n in s['nodes']:
        injection = sum(float(p[j]) for j,g in enumerate(s['generators']) if g['node']==n['id']) - n['load_mw']
        outflow = sum(float(f[j]) for j,l in enumerate(s['lines']) if l['from']==n['id']) - sum(float(f[j]) for j,l in enumerate(s['lines']) if l['to']==n['id'])
        residuals.append(abs(injection-outflow))
    gen_violation = max([0.] + [max(g['pmin_mw']-float(p[j]),float(p[j])-g['pmax_mw']) for j,g in enumerate(s['generators'])])
    line_violation = max([0.] + [abs(float(f[j]))-l['capacity_mw']*float(z[j]) for j,l in enumerate(s['lines'])])
    binary_violation = max(max(abs(float(v)-round(float(v))),-float(v),float(v)-1) for v in z)
    gen_cost = sum(float(p[j])*g['cost_yuan_mwh']*s['duration_hours'] for j,g in enumerate(s['generators']))
    line_cost = sum(float(z[j])*l['fixed_cost_yuan'] for j,l in enumerate(s['lines']))
    check = {'max_node_balance_residual_mw':max(residuals), 'max_generator_bound_violation_mw':gen_violation, 'max_line_limit_violation_mw':line_violation,
             'max_binary_violation':binary_violation, 'objective_recalculation_error_yuan':abs(gen_cost+line_cost-float(r.fun)), 'ac_physics':'not_checked', 'n_minus_one':'not_checked'}
    check['numerically_feasible_for_this_model'] = max(residuals+[gen_violation,line_violation,binary_violation]) <= 1e-6 and check['objective_recalculation_error_yuan']<=1e-4
    report.update(objective_yuan=float(r.fun),generation_cost_yuan=gen_cost,line_cost_yuan=line_cost,checks=check,mip_gap=float(r.mip_gap) if r.mip_gap is not None else None)
    report['generators']=[dict(g,output_mw=float(p[j])) for j,g in enumerate(s['generators'])]
    report['lines']=[dict(l,on=int(round(float(z[j]))),flow_mw=float(f[j])) for j,l in enumerate(s['lines'])]
    if not check['numerically_feasible_for_this_model']: report['status']='numerical_check_failed'
    return report


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input');parser.add_argument('--output',default='demo_result.json');args=parser.parse_args()
    raw=json.loads(Path(args.input).read_text(encoding='utf-8-sig')) if args.input else default_spec()
    result=solve(raw);Path(args.output).write_text(json.dumps({'spec':normalize(raw),'result':result},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
