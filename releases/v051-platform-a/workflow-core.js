/* Non-solving workflow engine. Static rules are not a mathematical or physical proof. */
(function (g) {
'use strict';
const copy = x => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const uid = prefix => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function hash(value) { let n = 2166136261; for (const c of JSON.stringify(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); } return (n >>> 0).toString(16).padStart(8, '0'); }
function fail(message) { throw new Error(message); }
function safe(value, depth = 0) {
  if (depth > 35) fail('数据嵌套过深');
  if (typeof value === 'number' && !Number.isFinite(value)) fail('数值必须有限');
  if (typeof value === 'string' && value.length > 350000) fail('单项文本过长');
  if (Array.isArray(value)) { if (value.length > 20000) fail('数据条目过多'); value.forEach(x => safe(x, depth + 1)); }
  else if (value && typeof value === 'object') for (const k of Object.keys(value)) { if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('不允许的字段名'); safe(value[k], depth + 1); }
  return value;
}
function parseJSON(text) { if (text.length > 5000000) fail('文件大于5 MB'); return safe(JSON.parse(text)); }
function initial() {
  return { schema_version: 'workspace-1.0', task: { id: uid('TASK'), name: '未命名建模任务', created_at: now() },
    requirements: { text: '', level: 'L1', case_id: null, revision: 0, conditions: [], confirmed_at: null },
    data: null, versions: [], active: null, reviews: {}, coverage: {}, reports: {}, external_reports: {},
    risk: null, risk_history: [], proposals: [], reward: { terms: [], confirmed_at: null, model_version: null }, audit: [] };
}
let state = initial();
function record(action, detail = '') { state.audit.push({ id: uid('EVT'), at: now(), action, detail: String(detail).slice(0, 1000) }); if (state.audit.length > 500) state.audit.shift(); }
const current = () => state.versions.find(x => x.id === state.active) || null;
const dataStamp = () => state.data ? state.data.case_id + '@' + state.data.data_version + ':' + hash(state.data) : 'unbound';
function confirmed() { const r = state.requirements; return !!r.confirmed_at && r.conditions.length > 0 && r.conditions.every(c => c.confirmed && c.text.trim()); }
function isFresh(v = current()) { return !!v && confirmed() && v.requirements_revision === state.requirements.revision && v.data_fingerprint === dataStamp(); }
function binding() { const v = current(); return { task_id: state.task.id, model_version: v?.id || null, model_hash: v?.hash || null, requirements_revision: state.requirements.revision, data_version: state.data?.data_version || null, data_fingerprint: dataStamp() }; }
function bound(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) fail('接口结果应为对象');
  const b = binding();
  for (const k of ['task_id', 'model_version', 'model_hash', 'requirements_revision', 'data_fingerprint']) if (report[k] !== b[k]) fail('报告字段 ' + k + ' 与当前任务或输入版本不匹配');
  if (!isFresh()) fail('当前模型已过期或需求未确认');
}
function invalidateRequirement() { state.requirements.confirmed_at = null; }
function setRequirements(text, level = 'L1', caseId = null, conditions = null) {
  if (!text.trim()) fail('请填写需求'); if (!['L1', 'L2', 'L3', 'L4'].includes(level)) fail('建模层级无效');
  const clauses = conditions || text.split(/[；;。\n]+/).map(x => x.trim()).filter(Boolean);
  if (!clauses.length || clauses.length > 80) fail('需求条件须为1至80条');
  state.requirements = { text: text.trim(), level, case_id: caseId, revision: state.requirements.revision + 1, confirmed_at: null,
    conditions: clauses.map((c, i) => ({ id: 'R' + String(i + 1).padStart(3, '0'), text: typeof c === 'string' ? c : String(c.text || ''), source: typeof c === 'string' ? '用户原文（规则分句，待核对）' : String(c.source || '模型提取，待核对'), confirmed: false })) };
  record('更新需求', '需求版本 ' + state.requirements.revision + '；已有模型需要重新匹配'); return state.requirements;
}
function updateCondition(id, text, source, accept) {
  const c = state.requirements.conditions.find(c => c.id === id); if (!c) fail('条件不存在');
  text = String(text).trim(); source = String(source).trim();
  if (!text || !source) fail('条件内容和来源不能为空');
  if (c.text !== text || c.source !== source) { state.requirements.revision++; invalidateRequirement(); }
  c.text = text; c.source = source; c.confirmed = !!accept; if (!accept) invalidateRequirement();
  record('核对需求条件', id + (accept ? ' 已核对' : ' 待确认'));
}
function addCondition(text) { if (!text.trim()) fail('条件不能为空'); if (state.requirements.conditions.length >= 80) fail('条件数量超过上限'); const n = state.requirements.conditions.reduce((n, c) => Math.max(n, +c.id.slice(1)), 0) + 1; state.requirements.conditions.push({ id: 'R' + String(n).padStart(3, '0'), text: text.trim(), source: '用户补充', confirmed: false }); state.requirements.revision++; invalidateRequirement(); record('补充条件', text); }
function confirmRequirements() { if (!state.requirements.conditions.length || state.requirements.conditions.some(c => !c.confirmed || !c.text.trim() || !c.source.trim())) fail('请先逐条核对全部条件'); state.requirements.confirmed_at = now(); record('确认需求', '需求版本 ' + state.requirements.revision); }
function validateData(x) {
  safe(x); const errors = [], warnings = []; const check = (ok, message) => { if (!ok) errors.push(message); };
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { errors: ['数据必须为对象'], warnings };
  for (const k of ['case_id', 'data_version', 'source']) check(typeof x[k] === 'string' && x[k].trim() && x[k] !== '待填写', k + '应填写实际标识或说明');
  for (const k of ['buses', 'branches', 'generators']) check(Array.isArray(x[k]), k + '应为数组');
  if (errors.length) return { errors, warnings };
  const pools = { bus: x.buses, branch: x.branches, generator: x.generators }; const busIDs = new Set();
  const numericFields = ['pd', 'qd', 'pmin', 'pmax', 'qmin', 'qmax', 'vmin', 'vmax', 'lon', 'lat', 'r', 'x', 'rate'];
  for (const [kind, entries] of Object.entries(pools)) {
    const seen = new Set();
    for (const e of entries) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) { errors.push(kind + '条目不是对象'); continue; }
      check(['string', 'number'].includes(typeof e.id) && String(e.id).length > 0 && !seen.has(String(e.id)), kind + '编号缺失或重复'); seen.add(String(e.id));
      if (kind === 'bus') busIDs.add(String(e.id));
      for (const k of numericFields) if (e[k] != null) check(typeof e[k] === 'number' && Number.isFinite(e[k]), kind + ' ' + e.id + ' 的 ' + k + '不是有限数值');
      for (const [lo, hi] of [['pmin', 'pmax'], ['qmin', 'qmax'], ['vmin', 'vmax']]) if (e[lo] != null && e[hi] != null) check(e[lo] <= e[hi], kind + ' ' + e.id + ' 上下限倒置');
      if (e.lon != null) check(Math.abs(e.lon) <= 180, '经度超出范围'); if (e.lat != null) check(Math.abs(e.lat) <= 90, '纬度超出范围');
      if (e.rate != null) check(e.rate >= 0, '线路容量不能为负'); if (e.status != null) check([0, 1].includes(e.status), '状态须为0或1');
      if (kind === 'branch' && e.x === 0) warnings.push('支路 ' + e.id + ' 电抗为0，需专业复核');
    }
  }
  for (const e of x.branches) if (e) check(busIDs.has(String(e.from)) && busIDs.has(String(e.to)), '支路端点不存在：' + e.id);
  for (const e of x.generators) if (e) check(busIDs.has(String(e.bus_id)), '机组连接母线不存在：' + e.id);
  if (!x.units || typeof x.units !== 'object') warnings.push('单位字典未提供'); else { if (x.units.power !== 'MW') warnings.push('功率单位未明确为MW，需确认转换'); if (x.branches.some(b => b?.rate != null) && !x.units.branch_rating) warnings.push('支路限值单位未声明，需区分MW与MVA'); }
  if (x.base_mva == null) warnings.push('功率基准值未提供'); else check(typeof x.base_mva === 'number' && Number.isFinite(x.base_mva) && x.base_mva > 0, 'base_mva须为正数'); if (!x.buses.length) warnings.push('母线数据为空');
  if (x.measurements !== undefined && !Array.isArray(x.measurements)) errors.push('measurements应为数组');
  const mids = new Set();
  for (const m of Array.isArray(x.measurements) ? x.measurements : []) {
    if (!m || typeof m !== 'object') { errors.push('测点条目无效'); continue; }
    check(typeof m.measurement_id === 'string' && m.measurement_id.trim() && !mids.has(m.measurement_id), '测点编号缺失或重复'); mids.add(m.measurement_id);
    check((pools[m.asset_type] || []).some(e => String(e?.id) === String(m.asset_id)), '测点映射目标不存在：' + m.measurement_id);
    if (!m.unit || !m.timestamp || !m.field) warnings.push('测点 ' + m.measurement_id + ' 缺少单位、字段或时标');
  }
  return { errors, warnings: [...new Set(warnings)] };
}
function setData(x) { const result = validateData(x); if (result.errors.length) fail(result.errors.slice(0, 5).join('；')); state.data = copy(x); state.risk = null; state.proposals = []; record('绑定数据', x.case_id + ' / ' + x.data_version); return result; }
function acceptModel(raw, origin = 'api', reason = '模型生成') {
  safe(raw); const model = g.DaliContract.parse(raw); if (!confirmed()) fail('请先确认需求条件');
  if (model.model_meta.model_level !== state.requirements.level) fail('返回模型与当前层级不一致');
  if (state.versions.length >= 40) fail('最多保留40个版本，请导出后新建任务');
  if (['manual', 'risk_revision'].includes(origin) && current()?.origin.startsWith('demo')) origin = 'demo_derived';
  const v = { id: uid('MODEL'), number: state.versions.length + 1, created_at: now(), reason, origin, model, hash: hash(model), requirements_revision: state.requirements.revision, data_fingerprint: dataStamp(), parent: state.active };
  state.versions.push(v); state.active = v.id; state.reviews[v.id] = {}; state.coverage[v.id] = {}; state.risk = null; state.proposals = []; state.reward.confirmed_at = null;
  record('生成模型版本', 'V' + v.number + ' / ' + origin + ' / ' + reason); return v;
}
function activate(id) { if (!state.versions.some(v => v.id === id)) fail('版本不存在'); state.active = id; state.risk = null; state.proposals = []; state.reward.confirmed_at = null; record('切换模型版本', id); }
function elements(model = current()?.model) {
  if (!model) return [];
  const out = [ { key: 'mathematical_model.formulation', name: '总体数学表达', expression: model.mathematical_model.formulation, source: '模型总体表达' }, { key: 'objective.expression', name: '目标函数', expression: model.objective.expression, source: model.objective.rationale }, { key: 'code.source', name: '模型代码（仅审核文本）', expression: model.code.source, source: model.code.framework } ];
  for (const p of ['sets_parameters', 'decision_variables', 'constraints', 'structural_changes', 'mathematical_model.equations', 'objective.terms']) p.split('.').reduce((o, k) => o[k], model).forEach((e, i) => out.push({ ...e, key: p + '.' + i }));
  return out;
}
function reviewState(e) { if (!isFresh()) return 'pending'; const r = state.reviews[state.active]?.[e.key]; return r && r.fingerprint === hash(e) ? r.decision : 'pending'; }
function review(key, decision, note = '', actor = '当前会话用户') { if (!isFresh()) fail('模型与当前需求或数据不一致'); const e = elements().find(e => e.key === key); if (!e || !['confirmed', 'rejected'].includes(decision)) fail('审核条目或状态无效'); state.reviews[state.active] ||= {}; state.reviews[state.active][key] = { decision, note, actor, at: now(), fingerprint: hash(e) }; record('人工审核', e.name + ' / ' + decision); }
function editExpression(key, expression, source) { if (!expression.trim()) fail('表达式不能为空'); const v = current(); if (!v || !elements().some(e => e.key === key)) fail('模型元素不存在'); const m = copy(v.model), path = key.split('.'); let target = m; for (const k of path.slice(0, -1)) target = target[k]; if (/^\d+$/.test(path.at(-1))) { target[+path.at(-1)].expression = expression; target[+path.at(-1)].source = source || '用户修改'; } else target[path.at(-1)] = expression; if (key !== 'code.source') m.missing_information = [...new Set([...m.missing_information, '人工修改后需复核数学表达与代码一致性。'])]; return acceptModel(m, 'manual', '人工修改 ' + key); }
function coverage() { return state.coverage[state.active] || {}; }
function mapCondition(id, keys) { if (!current() || !state.requirements.conditions.some(c => c.id === id)) fail('任务条件或模型不存在'); const valid = new Set(elements().map(e => e.key)); if (!Array.isArray(keys) || keys.some(k => !valid.has(k))) fail('模型元素关联无效'); state.coverage[state.active] ||= {}; state.coverage[state.active][id] = { keys: [...new Set(keys)], at: now() }; record('绑定条件与模型', id); }
function diff(a, b) { if (!a || !b) return []; const aa = new Map(elements(a.model).map(e => [e.key, e])), bb = new Map(elements(b.model).map(e => [e.key, e])); return [...new Set([...aa.keys(), ...bb.keys()])].filter(k => JSON.stringify(aa.get(k)) !== JSON.stringify(bb.get(k))).map(k => ({ key: k, name: bb.get(k)?.name || aa.get(k)?.name, type: !aa.has(k) ? '新增' : !bb.has(k) ? '删除' : '修改', before: aa.get(k)?.expression || '—', after: bb.get(k)?.expression || '—' })); }
function reportCurrent(r) { const b = binding(); return !!r && isFresh() && ['task_id', 'model_version', 'model_hash', 'requirements_revision', 'data_fingerprint'].every(k => r[k] === b[k]) && r.review_snapshot === hash(state.reviews[state.active] || {}) && r.coverage_snapshot === hash(coverage()); }
function validateModel() {
  const v = current(); if (!v) fail('请先生成或导入模型'); const m = v.model, checks = [];
  const put = (id, title, status, evidence, suggestion = '') => checks.push({ id, title, status, evidence, suggestion, scope: '平台静态规则' });
  const c = g.DaliContract.validate(m); put('SCHEMA', '输出契约', c.valid ? 'pass' : 'block', c.valid ? '必填字段与数据类型符合契约' : c.errors.join('；'));
  put('REQ', '需求条件已确认', confirmed() ? 'pass' : 'block', '当前需求版本 ' + state.requirements.revision, '逐条确认条件');
  put('FRESH', '模型与输入版本一致', isFresh(v) ? 'pass' : 'block', '绑定需求版本 ' + v.requirements_revision + '；当前 ' + state.requirements.revision, '基于当前输入重新建模');
  for (const [key, title] of [['decision_variables', '决策变量'], ['constraints', '约束'], ['sets_parameters', '集合参数']]) put('NONEMPTY-' + key, title + '非空', m[key].length ? 'pass' : 'block', m[key].length + ' 项');
  const all = [...m.sets_parameters, ...m.decision_variables, ...m.constraints, ...m.structural_changes, ...m.mathematical_model.equations, ...m.objective.terms], ids = all.map(e => e.id);
  put('IDS', '元素编号唯一', new Set(ids).size === ids.length ? 'pass' : 'block', '条目 ' + ids.length + ' / 唯一编号 ' + new Set(ids).size, '修正重复编号');
  const missing = all.filter(e => !e.source.trim()); put('SOURCE', '来源标注完整', missing.length ? 'warn' : 'pass', missing.length ? missing.map(e => e.id).join('、') : '已填写来源文本；不证明来源真实性', '核对原文或数据来源');
  const known = new Set(state.requirements.conditions.map(c => c.id)); const refs = all.filter(e => e.requirement_ids && (!Array.isArray(e.requirement_ids) || e.requirement_ids.some(id => !known.has(id))));
  put('REFS', '需求引用编号', refs.length ? 'warn' : 'pass', refs.length ? '未知引用：' + refs.map(e => e.id).join('、') : '未检出未知需求编号', '核对requirement_ids');
  const uncovered = state.requirements.conditions.filter(c => !coverage()[c.id]?.keys.length); put('COVERAGE', '条件到方程关联', uncovered.length ? 'warn' : 'pass', uncovered.length ? '未人工关联：' + uncovered.map(c => c.id).join('、') : '全部条件有人工关联；不证明数学等价', '在方程确认页绑定条目');
  const explicit = [...state.requirements.text.matchAll(/(?:设为|乘以|β\s*=)\s*([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi)].map(x => x[1]); const absent = [...new Set(explicit)].filter(n => !JSON.stringify(m).includes(n));
  put('VALUE-TRACE', '显式数值线索覆盖（启发式）', absent.length ? 'warn' : 'pass', absent.length ? '未找到数值：' + absent.join('、') : '未检出显式数值线索遗漏；不证明使用对象正确', '核对参数对象、单位和修改运算');
  put('MISSING', '待补充信息', m.missing_information.length ? 'warn' : 'pass', m.missing_information.join('；') || '模型未列出缺失信息，仍须人工检查', '补充依据后修订');
  const es = elements(), pending = es.filter(e => reviewState(e) !== 'confirmed'); put('REVIEW', '人工方程与代码确认', pending.length ? 'warn' : 'pass', pending.length + ' / ' + es.length + ' 项待确认或退回');
  const noUnits = m.decision_variables.filter(e => !e.unit); put('UNITS', '变量单位声明', noUnits.length ? 'warn' : 'pass', noUnits.length ? noUnits.map(e => e.name).join('、') : '变量单位已标注；未做符号量纲推导');
  const dc = /DCOPF|DC-OPF|直流最优潮流/i.test(m.model_meta.problem_type), bad = m.decision_variables.filter(e => /无功出力|电压幅值/.test(e.name)); put('DC-TYPE', '模型类型相容性线索', dc && bad.length ? 'warn' : 'pass', dc && bad.length ? '直流模型仍有：' + bad.map(e => e.name).join('、') : '当前规则未发现明显类型冲突', '核对建模假设');
  const placeholders = /TODO|待生成|\.\.\./i.test(m.code.source); put('CODE-TEXT', '代码占位文本', placeholders ? 'warn' : 'pass', placeholders ? '发现占位内容' : '未命中预设占位模式；不证明代码可运行');
  const dangerous = /\b(exec|eval)\s*\(|subprocess|os\.system|system\s*\(/.test(m.code.source); put('CODE-RISK', '有限代码风险筛查', dangerous ? 'warn' : 'pass', dangerous ? '发现需人工审查的调用' : '未命中有限规则；不是安全沙箱判定', '不自动执行生成代码');
  if (state.data) { const d = validateData(state.data); put('DATA', '数据基础检查', d.errors.length ? 'block' : d.warnings.length ? 'warn' : 'pass', [...d.errors, ...d.warnings].join('；') || '编号、端点、数值及声明边界检查通过'); } else put('DATA', '数据绑定', 'warn', '尚未绑定基础算例数据；参数化模型仍可审阅');
  put('PHYSICS', '专业数学与电力物理验证', 'not_run', '规则检查不证明潮流正确性、模型等价性或安全性', '可接入独立专业验证服务');
  put('EXEC', '代码执行与求解', 'not_run', '本版本不执行生成代码、不求解');
  const report = { ...binding(), review_snapshot: hash(state.reviews[state.active] || {}), coverage_snapshot: hash(coverage()), engine: 'platform-static-v1', created_at: now(), checks, counts: Object.fromEntries(['pass', 'warn', 'block', 'not_run'].map(s => [s, checks.filter(c => c.status === s).length])) };
  state.reports[v.id] = report; record('执行静态校验', '规则通过 ' + report.counts.pass + '；关注 ' + report.counts.warn + '；阻断 ' + report.counts.block); return report;
}
function acceptExternal(raw, kind) { safe(raw); bound(raw); if (typeof raw.report_id !== 'string' || !raw.report_id || typeof raw.engine !== 'string' || !raw.engine || !Array.isArray(raw.findings)) fail('报告缺少report_id/engine/findings'); for (const f of raw.findings) if (!f || !['info', 'warning', 'error'].includes(f.severity) || !f.message || !f.evidence) fail('报告发现须含级别、说明和证据'); state.external_reports[state.active] ||= []; state.external_reports[state.active].push({ ...copy(raw), kind, received_at: now() }); record('接收外部复核', raw.report_id + ' / ' + kind); }
function acceptRisk(raw, origin = 'service') { safe(raw); bound(raw); if (typeof raw.risk_id !== 'string' || !raw.risk_id || !Array.isArray(raw.findings) || !Array.isArray(raw.recommended_changes)) fail('风险报告格式不正确'); for (const f of raw.findings) if (!f || typeof f.message !== 'string' || typeof f.evidence !== 'string') fail('风险发现须有说明与证据'); for (const p of raw.recommended_changes) if (!p || typeof p.id !== 'string' || !p.id || !['constraint', 'objective', 'parameter'].includes(p.kind) || typeof p.expression !== 'string' || !p.expression || typeof p.evidence !== 'string' || !p.evidence) fail('每条风险建议须含编号、类型、表达式、证据'); if (new Set(raw.recommended_changes.map(p => p.id)).size !== raw.recommended_changes.length) fail('风险建议编号重复'); state.risk = { ...copy(raw), origin, received_at: now() }; state.proposals = raw.recommended_changes.map(p => ({ ...copy(p), decision: 'pending' })); record('接收风险意见', raw.risk_id + ' / ' + origin); }
function decideProposal(id, decision) { bound(state.risk); const p = state.proposals.find(p => p.id === id); if (!p || !['accept', 'reject'].includes(decision)) fail('建议或处置无效'); p.decision = decision; record('风险意见协商', id + ' / ' + decision); }
function applyRisk() { bound(state.risk); const ps = state.proposals.filter(p => p.decision === 'accept'); if (!ps.length) fail('请先接受至少一项建议'); const m = copy(current().model), risk = copy(state.risk), old = binding(); for (const p of ps) { const item = { id: 'RISK-' + p.id + '-' + state.versions.length, name: p.name || p.id, expression: p.expression, source: '风险报告 ' + risk.risk_id + ' / ' + p.evidence, status: 'proposed', unit: p.unit || null, scope: p.asset_id || null }; (p.kind === 'constraint' ? m.constraints : p.kind === 'parameter' ? m.sets_parameters : m.objective.terms).push(item); m.structural_changes.push({ ...item, id: item.id + '-DELTA', name: '待同步修改：' + item.name }); } m.missing_information = [...new Set([...m.missing_information, '风险建议已进入候选模型，请同步总体数学表达、目标与代码后重新确认。'])]; state.risk_history.push({ ...old, risk, decisions: copy(state.proposals), at: now() }); return acceptModel(m, risk.origin === 'demo' ? 'demo_derived' : 'risk_revision', '依据风险意见 ' + risk.risk_id + ' 修订'); }
function setReward(terms, accept) { safe(terms); if (!terms.length) fail('至少配置一项Reward指标'); for (const t of terms) if (!t.name || !t.metric || !t.normalization || !Number.isFinite(t.weight) || t.weight < 0 || !['minimize', 'maximize'].includes(t.direction)) fail('Reward需要名称、指标、归一化依据、方向和非负权重'); state.reward = { terms: copy(terms), confirmed_at: accept ? now() : null, model_version: state.active }; record('保存Reward设计', accept ? '人工确认设计；未训练或计算奖励' : '设计草稿'); }
function handoff() { const v = current(); if (!v) fail('尚无模型'); return { kind: 'modeling-handoff-1.0', ...binding(), exported_at: now(), model_origin: v.origin, requirements: copy(state.requirements), data: copy(state.data), model: copy(v.model), reviews: copy(state.reviews[v.id] || {}), coverage: copy(coverage()), static_report: copy(state.reports[v.id] || null), external_reports: copy(state.external_reports[v.id] || []), risk: copy(state.risk), risk_history: copy(state.risk_history), reward: copy(state.reward), readiness: { requirements_confirmed: confirmed(), model_current: isFresh(), all_elements_confirmed: isFresh() && elements().length > 0 && elements().every(e => reviewState(e) === 'confirmed'), static_report_current: reportCurrent(state.reports[v.id]), solver_executed: false, physical_verification: 'not_run', purpose: '建模资料交接，不是可执行性或安全性证明' } }; }
function importState(s) {
  safe(s); if (s.schema_version !== 'workspace-1.0' || !s.requirements || !Array.isArray(s.versions) || s.versions.length > 40) fail('不支持的工作包');
  const n = initial(), r = copy(s.requirements); n.task.name = String(s.task?.name || '导入任务');
  if (typeof r.text !== 'string' || !['L1','L2','L3','L4'].includes(r.level) || !Number.isInteger(r.revision) || r.revision < 0 || !Array.isArray(r.conditions) || r.conditions.length > 80) fail('需求格式无效');
  for (const c of r.conditions) if (!/^R\d{1,5}$/.test(c.id) || typeof c.text !== 'string' || typeof c.source !== 'string') fail('需求条件格式无效');
  if (new Set(r.conditions.map(c => c.id)).size !== r.conditions.length) fail('条件编号重复');
  r.confirmed_at = null; r.conditions.forEach(c => c.confirmed = false); n.requirements = r;
  if (s.data) { const d = validateData(s.data); if (d.errors.length) fail(d.errors.join('；')); n.data = copy(s.data); }
  const stamp = n.data ? n.data.case_id + '@' + n.data.data_version + ':' + hash(n.data) : 'unbound';
  n.versions = s.versions.map((v, i) => { const model = g.DaliContract.parse(v.model); return { id: uid('IMPORT'), number: i + 1, created_at: now(), reason: '导入版本，需重新审核', origin: String(v.origin || '').startsWith('demo') ? 'demo_import' : 'import', model, hash: hash(model), requirements_revision: Number.isInteger(v.requirements_revision) ? v.requirements_revision : r.revision, data_fingerprint: typeof v.data_fingerprint === 'string' ? v.data_fingerprint : stamp, parent: null, imported_from: String(v.id || '') }; });
  n.active = n.versions.at(-1)?.id || null; state = n; record('导入工作包', '已重置确认、校验与风险结论'); return state;
}
function saveLocal() { record('保存工作包', '此浏览器本地存储，不包含API密钥'); try { localStorage.setItem('dali-workspace-v4', JSON.stringify(state)); } catch { fail('本地存储不可用或空间不足，请导出工作包'); } }
function restoreLocal() { let s; try { s = JSON.parse(localStorage.getItem('dali-workspace-v4') || 'null'); } catch { fail('本地工作包损坏'); } if (!s) fail('没有保存的工作包'); return importState(s); }
function reset() { state = initial(); record('新建任务', state.task.id); }
function setName(n) { state.task.name = String(n).trim().slice(0, 120) || '未命名建模任务'; }
g.DaliWorkflow = { get: () => state, clone: copy, hash, safe, parseJSON, reset, setName, record, current, binding, bound, isFresh, confirmed, invalidateRequirement, setRequirements, updateCondition, addCondition, confirmRequirements, validateData, setData, acceptModel, activate, elements, review, reviewState, editExpression, coverage, mapCondition, diff, reportCurrent, validateModel, acceptExternal, acceptRisk, decideProposal, applyRisk, setReward, handoff, exportState: () => copy(state), importState, saveLocal, restoreLocal };
})(typeof window === 'undefined' ? globalThis : window);
