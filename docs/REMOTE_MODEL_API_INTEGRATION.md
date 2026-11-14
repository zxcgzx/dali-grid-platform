# 远程模型 API 接入说明 · V0.3

## 路线
平台只调用API，不下载模型、不读取本地权重、不依赖Transformers、Torch、CUDA或Gradio。参考代码demo_4.py仅用于交互与题目参考；完整静态评估见DEMO4_CODE_REVIEW_ZH.md。

## 页面配置
在“需求理解”或“动态建模”页的“模型API接入设置”填写服务基础地址、模型标识、对话路径和API密钥。默认地址和模型标识为空，不沿用旧版localhost配置。

基础地址示例为 `https://api.example.com/v1`，路径为 `/chat/completions`。页面使用POST，消息为system/user结构，按服务需要选择JSON模式（发送response_format）或提示词约束JSON（不发送response_format）。示例域名只是占位，不能直接调用。

服务方应返回：
```json
{"choices":[{"message":{"content":"符合模型契约的JSON字符串"}}]}
```
也可由项目适配层返回 `{"output": {...模型对象...}}`。其他API协议需在适配层转换，不保证任意厂商的任意接口都直接兼容。

## 用户任务与来源
动态建模请求包含中文prompt、level、完整中文level_name、source_case及output_schema。编辑原题会记录“题干已改写”，不会仍然宣称是未修改原题。自然语言页允许用户指定建模层级，也可交由模型判定。

采用完整JSON响应；当前不实现SSE流式显示。生成过程中修改题干会使旧请求结果失效，不覆盖新草案，但远端已经接收的请求可能仍产生费用。

## 输出契约
顶层必填：schema_version、request_summary、model_meta、sets_parameters、mathematical_model、decision_variables、objective、constraints、assumptions、missing_information、structural_changes、solver_specification、code、validation、provenance。

每个模型条目有id、name、expression、source、status；可带symbol、unit、scope。界面同时显示名称、表达式、单位、范围、来源，避免只显示名称而遗漏公式。

前端递归检查必填字段、类型、枚举和数组；缺字段、错误JSON、非法嵌套结构和不匹配的指定层级会被拒绝。代码和公式作为转义文本显示，不使用eval或宿主机执行。

收到结果后，syntax、dimensions、physical、solver_readiness全部重置为pending。独立校验服务尚未接入；不能用LLM自评或JSON结构通过来证明物理正确。

## 密钥和安全
原型仅在当前页面内存保留API密钥，刷新丢失；配置使用新的 `dali-grid-api-v3` 存储键，只保存白名单的非敏感字段。空密码框不清空已配置密钥，需显式清除。

这不等于浏览器直连适合生产共享使用。正式部署请将长期密钥保存在项目服务端网关，前端只使用项目会话；本交付未包含生产网关。服务方需配置正确CORS来源、权限、用量和访问审计。不要为演示开放生产控制权限。

“测试API连接”发送一条max_tokens=32的最小请求，可能计费；仅由点击触发。页面打开、题目切换和查看模板不会自动访问模型API。模型调用超时120秒，风险请求60秒；拒绝重定向，错误消息不回显密钥或完整服务错误正文。

## 风险与求解
课题3通过独立API配置评估路径与健康检查路径。工况JSON字段为讨论草案，服务契约待双方确认；页面只显示接口返回，不合成风险等级。

优化求解只显示求解器选择和任务状态。求解器选择不代表实现已接入，更不代表对所有模型保证兼容；具体路由与能力检查在后端处理。
