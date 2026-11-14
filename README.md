# 运行方式智能调整平台A

当前发布版本为 `releases/v051-platform-a`。完整云端演示由 Python 提供九模块界面、参数编译和 SciPy/HiGHS 四节点真实求解。

- 云部署：根目录 `render.yaml`，详见 [部署说明](docs/CLOUD_DEPLOYMENT_ZH.md)。默认网站凭链接公开访问。
- 本机运行：双击根目录 `启动平台.bat`。
- 云端入口：`python releases/v051-platform-a/serve_cloud.py`，需要设置 `DALI_PUBLIC_URL` 或由 Render 自动提供域名。
- 模型API由访客自行填写，默认不提供共享密钥；四节点示例无需模型API。
- 当前真实求解范围是四节点无损运输网络教学示例，不代表其他业务算法已经接入。

以下保留早期 V0.3 文档，当前入口和能力以本节及云部署说明为准。

## 早期 V0.3 说明

## 打开网页
解压后直接打开 `index.html`，可离线浏览九个业务页面、中文论文题库和模型展示样例。无需安装前端依赖，不加载任何模型权重。

实际调用远程API时建议通过HTTP访问页面，以便配置正确的跨域来源。例如在项目目录执行：

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

访问 `http://127.0.0.1:8765`。这是静态网页预览服务，不是本地大模型部署。共享部署应由项目网关代理模型API并保管服务凭据。

## 本次改动
- 北大红、白、暖灰的科研工作台；主色采用北大标识管理办公室列出的Web色值 `#94070A`。
- 三家标识保持北大上行，南方电网和怀柔实验室下行并排。图片保持原色和比例。
- 四道ProOPF-B附录E.1—E.4评测题默认中文展示与中文提交，英文原文仅在展开来源时可见。
- L1显式参数修改型建模；L2场景语义参数推理型建模；L3显式参数与模型结构扩展型建模；L4场景语义推理与模型结构扩展型建模。
- 动态建模页实现层级、选题和可编辑题干同步。发送用户实际编辑的文字，不回退到隐藏的英文或原始题目。
- 模型API配置包括地址、模型名、对话接口路径、输出协议和密钥；不预填本地模型地址或模型路径。
- 数学模型页以同一份结果分块展示，支持分区筛选、原始JSON、代码复制、代码下载、模型导入与导出。
- 求解页保留自动选择、Gurobi、COPT、IPOPT、其他求解器等选项，以及简洁任务状态。
- 铮昊四节点例题译为中文，可从需求页载入；它是补充案例，不取代四道论文题。

## 演示与真实能力边界
“查看展示样例”载入的是人工整理的版式模板，页面与导出记录标注其来源，不是API生成结果，更不是论文完整答案。

只有用户点击测试或生成按钮才会调用已配置的API。模型结果须满足 `schemas/model-output-v1.schema.json`；`model-contract.js`离线提供相同字段契约的递归校验。校验模型的数据结构不等于验证数学或物理正确性。所有模型自报的校验通过状态会重置为待校验。

网页不执行生成代码。不内置真实优化求解、N−1校核、课题2测点适配或课题3风险算法；对应业务服务需后续接入。

## 接入位置
- `api-adapters.js`：远程模型API和风险评估请求；当前使用完整JSON响应，尚未实现流式输出。
- `DaliAPI.llm.analyzeRequirement(payload)`：自然语言建模。
- `DaliAPI.modeling.buildModel(payload)`：动态建模。
- `DaliAPI.topic3.assessRisk(payload)`：风险评估。
- `DaliAPI.modeling.validateModel / DaliAPI.solver`：独立校验与计算服务占位。
- `advanced.js`：中文题库、用户草案、请求及分块展示。
- `research.css`：本次科研视觉样式。

API密钥只保存在页面内存中，刷新后消失；服务配置保存在 `dali-grid-api-v3`。不会沿用旧版默认本地模型配置。空密钥框表示不修改已存会话密钥，清除须点击“清除密钥”。

## 文档
- `docs/DEMO4_CODE_REVIEW_ZH.md`：铮昊代码静态评估、可复用部分、两道原始示例中文译文。
- `docs/REMOTE_MODEL_API_INTEGRATION.md`：API请求、输出和密钥边界。
- `docs/DESIGN_REFERENCES.md`：Gurobi工作流与北大色彩参考的实际借鉴范围。
- `examples/proopf-b-test-cases.json`：中英文对照的四题数据。
- `assets/partners-official/SOURCES.md`：标识来源。

## 验证
运行 `node tests/research-v03.mjs`，需要本机Chrome/Edge和Node.js（含WebSocket）。脚本使用临时浏览器目录和临时HTTP测试桩，不调用外部付费API，不需要GPU或模型权重。

报告：`artifacts/research-v03/validation.json`。截图也在该目录。测试桩验证API请求和前端行为，不证明用户真实API、求解器或风险服务已连通。

## 项目范围
所有修改局限于独立项目，不修改父目录的求解实验、历史结果或原始数据。标识展示不代表额外官方认证或生产部署许可。
