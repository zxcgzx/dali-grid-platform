# 当前本机版本：运行方式智能调整平台A

当前启动入口：项目根目录 `启动平台.bat`。
当前运行目录：`releases/v051-platform-a`。
启动程序：`serve_demo.py`，默认仅监听 `127.0.0.1:8766`。
平台标题、侧栏品牌、首页标题、面包屑和页脚统一为“运行方式智能调整平台A”；数据中的真实地名和地图来源不改。

本版从已交付的 V0.5.1 完整演示包安装，保留原九模块和Logo布局。根目录启动脚本优先使用已验证的 Python 3.11 环境，缺失时尝试 PATH 上的 python；不自动安装软件，不部署LLM，不读取或代填API密钥。

工作台 → 打开四节点贯通示例 → 载入已核定数值（不调用LLM）→ 参数编译 → 方程确认 → 运行本机真实求解 → 结果分析。
真实自然语言解析需要用户填写模型API，再点击“调用模型API解析”。

验证：`releases/v051-platform-a/tests/platform-a-native.mjs` 在本机Chrome通过实际HTTP加载界面，操作免LLM示例并调用真实SciPy/HiGHS。测试报告在该目录的 `artifacts/platform-a/native-validation.json`；不代表正式LLM服务已联通或实际电网安全已验证。

旧版保留在 `releases/v05-visualization`；旧根入口备份：`artifacts/platform-a/previous-entrypoints.zip`。没有修改求解实验、真实数据或历史计算结果。

若8766端口已被其他服务占用，不停止未知进程；使用命令 `启动平台.bat --port 8767`。旧8765页面不会自动变为本版，请打开8766地址。
