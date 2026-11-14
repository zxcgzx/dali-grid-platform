/* 结构化模型契约。可离线读取；只验证数据，不执行模型返回的任何代码。 */
(function () {
  'use strict';
  const str = {type:'string'}, strs = {type:'array',items:str};
  const nullable = {type:['string','null']};
  const obj = (properties, required=Object.keys(properties)) => ({type:'object',properties,required});
  const item = obj({id:str,name:str,expression:str,source:str,status:{enum:['proposed','confirmed','pending','rejected']},symbol:nullable,unit:nullable,scope:nullable},['id','name','expression','source','status']);
  const items = {type:'array',items:item};
  const checkState = {enum:['pending','passed','failed','not_run']};
  const schema = obj({
    schema_version:{const:'1.0'},request_summary:str,
    model_meta:obj({problem_type:str,system:str,time_horizon:nullable,model_level:{enum:['L1','L2','L3','L4']},base_model_version:nullable},['problem_type','system','time_horizon','model_level']),
    sets_parameters:items,
    mathematical_model:obj({formulation:str,equations:items,notes:strs}),
    decision_variables:items,
    objective:obj({sense:{enum:['minimize','maximize']},expression:str,terms:items,rationale:str}),
    constraints:items,assumptions:strs,missing_information:strs,structural_changes:items,
    solver_specification:obj({solver:nullable,tolerance:{type:['string','number','null']},output_settings:strs}),
    code:obj({language:str,framework:str,entrypoint:str,source:str,dependencies:strs}),
    validation:obj({syntax:checkState,dimensions:checkState,physical:checkState,solver_readiness:checkState,findings:strs}),
    provenance:obj({source_case:nullable,model_name:nullable,generated_at:nullable})
  });
  schema.title='大理电网结构化优化模型输出规范';
  schema.$schema='https://json-schema.org/draft/2020-12/schema';
  function validate(data) {
    const errors=[];
    function walk(value, rule, at) {
      if(errors.length>=30) return;
      if(rule.const!==undefined && value!==rule.const) errors.push(at+'：版本或常量不匹配');
      if(rule.enum && !rule.enum.includes(value)) errors.push(at+'：不在允许的取值范围内');
      const actual=value===null?'null':Array.isArray(value)?'array':typeof value;
      if(rule.type && ![].concat(rule.type).includes(actual)) {errors.push(at+'：字段类型错误');return;}
      if(actual==='string' && value.length>300000) {errors.push(at+'：文本过长');return;}
      if(actual==='number' && !Number.isFinite(value)) errors.push(at+'：数值必须有限');
      if(actual==='array') {
        if(value.length>1000) {errors.push(at+'：条目数量过多');return;}
        value.forEach((v,i)=>walk(v,rule.items||{},at+'['+i+']'));
      }
      if(actual==='object') {
        for(const key of Object.keys(value)) if(['__proto__','constructor','prototype'].includes(key)) errors.push(at+'：不允许的字段');
        for(const key of rule.required||[]) if(!Object.prototype.hasOwnProperty.call(value,key)) errors.push(at+'.'+key+'：缺少必填字段');
        for(const [key,r] of Object.entries(rule.properties||{})) if(Object.prototype.hasOwnProperty.call(value,key)) walk(value[key],r,at+'.'+key);
      }
    }
    walk(data,schema,'模型');
    return {valid:errors.length===0,errors};
  }
  function parse(response, provenance={}) {
    let content=response?.choices?.[0]?.message?.content ?? response?.output ?? response;
    if(typeof content==='string') {
      if(content.length>1500000) throw new Error('响应超过展示大小限制');
      content=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
    }
    const result=validate(content);
    if(!result.valid) throw new Error(result.errors.slice(0,3).join('；'));
    const safe=JSON.parse(JSON.stringify(content));
    // 不采信模型自评：这些字段只能由独立校验服务的证据更新。
    safe.validation={syntax:'pending',dimensions:'pending',physical:'pending',solver_readiness:'pending',findings:['尚未执行独立校验。']};
    safe.provenance={...safe.provenance,...provenance};
    return safe;
  }
  window.DaliContract=Object.freeze({schema,validate,parse});
})();
