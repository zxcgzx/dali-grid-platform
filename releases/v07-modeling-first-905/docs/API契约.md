# 接口约定

## 本机工作空间

默认地址为 `http://127.0.0.1:8770`。本机服务负责数据读取、需求解析、规格编译、模型校验、模型构建检查、风险模拟和结果导入，不在本机启动优化求解。

- `GET /api/case`：905节点统一数据。
- `GET /api/scenarios`：L1—L4场景模板。
- `GET /api/archive/ACOTS`：已有16时段AC-OTS案例。
- `POST /api/analyze`：自然语言需求解析。
- `POST /api/compile`：结构化规格、方程、变量和代码。
- `POST /api/validate`：分层校验。
- `POST /api/build`：受控模型构建检查，不调用求解器。
- `POST /api/risk/mock`、`POST /api/risk/apply`：风险模拟与协商版本。
- `POST /api/evaluate`：L1—L4批量测评。
- `POST /api/results/import`：校验并导入求解结果。

## 外部服务

模型服务采用兼容Chat Completions的JSON接口。求解服务、课题2测点/大模型、课题3风险与Reward、方法复核、宿主平台均独立配置。求解请求携带 `task_id`、`model_version`、`spec_hash`、`case_id`、`data_sha256`、`spec` 和求解器选项；响应必须返回相同 `spec_hash` 和 `905-result.1` 结果结构。

## 结果结构

结果必须匹配 `case_id=DALI905` 和数据SHA。母线、电压、相角、机组、支路数组分别按905、237、1000的原始编号顺序排列；相角单位为rad，功率单位为MW/Mvar，电压为p.u.。未返回的量用null，不补零。N−1结果需包含故障范围、场景总数和逐场景strict/incremental/emergency标识。

## 测点与安全

测点数据支持JSON/CSV预览，映射关系支持导入与回写预览；回写固定 `mode=preview`、`execute=false`。不向现场设备发送控制指令。API密钥仅在当前会话使用，不写入浏览器持久存储。
