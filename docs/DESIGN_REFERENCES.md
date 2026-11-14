# 交互与视觉参考说明

核对日期：2026-11-13。

## Gurobi Modeler：借鉴的是工作流，不是产品复刻
官方文档：https://docs.gurobi.com/projects/intelligence/en/current/modeler.html
官方方法说明：https://docs.gurobi.com/projects/intelligence/en/current/methodology.html

公开文档展示的工作流包括：通过自然语言澄清需求，形成规格文档，再生成实现和测试，并按需生成数学表达；需求修改先更新规格，再传播到代码和测试。

本项目借鉴了需求、模型规格、数学表达、代码、校验/来源分开管理的组织方式。没有复制Gurobi源码、图标或完整UI，也没有连接Gurobi Modeler服务。求解页的Gurobi仅是待接入的计算方案选项。

本平台当前实现的是中文工作区、API适配、输出结构检查和文件展示；尚未实现Gurobi文档所描述的自动单元测试、修复迭代或其完整能力。后续应由独立校验/求解服务补足。

## 北大红与科研审美
官方常见问题：https://vim.pku.edu.cn/cjwt/index.htm
其“什么是北大红”条目列出的Web色值为94070A。本项目使用 `#94070A` 作为网页强调色；白、暖灰和其他辅助颜色为本项目自行配制，不声称是北大官方完整网页模板。

采用白底侧栏、细边框、少量红色选中态、无发光效果、无大面积蓝紫渐变。主要信息以可审阅的表格、公式区、变量条目和代码区展示，不采用聊天机器人营销大屏。

三家Logo继续使用本地官方来源素材，一上两下排布，保留完整文字、原色和比例。来源见 assets/partners-official/SOURCES.md。
