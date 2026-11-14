# V0.4 数据与API契约（平台接入草案）

这些字段是本版平台工程约定，不是会议原文逐字指定的协议，也不是课题2/3团队已经签字确认的正式协议。实际服务字段不同，需在services-v4.js增加适配；禁止静默猜测字段。

## 1. 公共绑定字段

下列五个字段由当前平台任务生成，风险、专业验证、模型复核与反馈回执必须原样回传：

```json
{
  "task_id": "当前任务ID",
  "model_version": "当前模型版本ID",
  "model_hash": "当前模型变化检测指纹",
  "requirements_revision": 1,
  "data_fingerprint": "当前数据指纹或unbound"
}
```

数据版本另有data_version。model_hash采用FNV32用于状态变化检测，不是安全签名。当前模型或输入变化时旧报告不可纳入。

## 2. 模型接口（primary / topic2Model）

配置基础地址、path、model；请求采用POST Chat Completions兼容格式。

```json
{
  "model": "服务提供方的标识",
  "stream": false,
  "response_format": {"type": "json_object"},
  "messages": [
    {"role": "system", "content": "中文结构化输出、来源记录、不执行代码等约束"},
    {"role": "user", "content": "JSON字符串：task、prompt、requirements、previous_model、human_reviews、static_report、risk_feedback、output_schema等"}
  ]
}
```

不支持response_format的服务可选择“提示词约束JSON”，由前端检查返回格式。尚未实现SSE流式展示，返回完整JSON后渲染。

响应支持choices[0].message.content、output或直接模型对象。模型字段见schemas/model-output-v1.schema.json与model-contract.js，递归检查必填字段/类型/枚举。数学表达建议可直接阅读的Unicode；字符串与代码仅作为文本展示。

模型条目可扩展requirement_ids数组用于声明对应需求。大模型声明的validation通过状态会重置为pending。接口结构合法不等于数学正确。

需求提取任务返回：
```json
{"conditions":[{"text":"条件内容","source":"对应用户原文片段"}],"missing_information":["待补充信息"]}
```

完整电网数据默认不发送。仅传数据摘要；用户勾选授权后才传data。需求和模型正文仍会发送，因此仍需业务授权。

## 3. 数据接口（topic2Data）

POST当前绑定字段及request=data_snapshot；响应可直接为数据对象或{"data":对象}。默认path为/api/data/snapshot。

数据对象需要case_id、data_version、source和buses、branches、generators数组。可选base_mva、units、coordinate_system、measurements与notes。

| 对象 | 最少关联字段 | 可选数据 |
|---|---|---|
| buses | id | name、pd、qd、vmin、vmax、lon、lat |
| branches | id、from、to | r、x、rate、status |
| generators | id、bus_id | pmin、pmax、qmin、qmax、cost |
| measurements | measurement_id、asset_type、asset_id | field、unit、timestamp、value |

字段以小写标准化；数据编号不能重复；支路端点和机组母线需存在。base_mva提供时须为正数。units.power应明确MW；units.branch_rating需区分MW/MVA。没有坐标则不放到地理图；coordinate_system未知不自动转换。测点映射只是关联，不代表设备动作回写已实现。

## 4. 独立报告（reviewer / validator）

reviewer是Chat Completions兼容复核模型，validator是普通JSON REST专业验证接口。默认validator路径/api/validate。返回公共绑定字段，以及：

```json
{
  "report_id":"report-001",
  "engine":"真实服务或算法名称与版本",
  "findings":[
    {"severity":"warning","message":"具体问题","evidence":"依据或检查记录","suggestion":"处理建议"}
  ]
}
```

severity允许info、warning、error。复核模型结果标记为建议，专业服务原样保留引擎和证据。仅上传一段“passed”不能作为专业验证报告。

## 5. 风险评估（risk）

POST公共绑定字段、requirements、model及可选数据；purpose标记“建模后风险协商，未求解”。默认/api/risk/assess。

响应公共绑定字段以及：
```json
{
  "risk_id":"risk-001",
  "risk_level":"服务方定义的等级，可不提供",
  "findings":[{"message":"风险发现","evidence":"来源或算法证据"}],
  "recommended_changes":[
    {"id":"change-001","kind":"constraint","name":"建议名称","expression":"候选约束","evidence":"修改依据"}
  ]
}
```

kind取constraint/objective/parameter。每项支持接受或拒绝，接受项进入新候选版本并标记需要同步整体表达和代码。风险等级不直接等同于故障事实。建议类型不是任意代码，不在网页执行。

## 6. Reward协商反馈（reward）

默认/api/reward/feedback。请求公共绑定字段、risk_id、decisions及reward_design。每个terms条目包含name、metric、weight（有限非负数）、direction（minimize/maximize）、normalization（明确依据）。不强制权重和为1，因为原材料没有规定这种规则。

反馈必须带同一组公共绑定字段和非空receipt_id。平台记录真实回执，不把“已发出请求”当成“对方已接收”。模型变化后奖励设计须重新确认。

## 7. 平台自有网关

serve.py仅绑定127.0.0.1。/api/session提供随机会话令牌；/api/proxy要求同源与X-Dali-Token。允许服务白名单、POST/GET、请求/响应大小限制、超时、禁止重定向；默认仅转发公共HTTPS。--allow-private-api显式允许可信内网HTTP服务。

可通过环境变量DALI_PRIMARY_API_KEY、DALI_TOPIC2MODEL_API_KEY、DALI_REVIEWER_API_KEY等设置服务端密钥。浏览器填写的会话密钥优先，但不写localStorage。服务日志不记录请求正文和密钥。

这是本机科研网关，不是可直接暴露到公网的多用户平台。没有用户身份体系、细粒度权限、生产审计、DNS解析绑定或资源级沙箱。正式共享部署应改为鉴权网关、固定目标白名单、服务端密钥托管及网络出口控制。

/api/check-code只支持Python ast.parse。不会加载权重、不导入模型依赖、不运行生成代码。不支持的代码语言返回not_run。

## 8. 求解交接

kind=modeling-handoff-1.0，含当前绑定、需求、模型、数据、审核、关联、静态报告、外部报告、风险协商历史、奖励设计和readiness。无论是否完成平台检查，solver_executed恒为false，专业物理验证不由平台静态规则替代。本次没有实现求解API。
