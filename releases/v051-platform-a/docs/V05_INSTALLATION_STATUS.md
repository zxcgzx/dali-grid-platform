# V0.5 本机同步与验证状态

本机项目根目录：C:\Users\BUG终结者\Desktop\WebCodex-Test\Dali-Grid-Intelligent-Platform。
实际运行版位于 releases/v05-visualization，根目录启动平台.bat与index.html已更新为新入口。
原根目录业务源码保留，入口备份位于artifacts/imports/v05/root-entry-backup.zip。
运行网站的20个核心文件及测试脚本与本完整下载包逐项SHA-256一致。说明文档和测试证据集合因环境不同略有差异。

本包可独立解压直接运行启动平台.bat，无需上述目录层次。
本次没有停止用户自行运行的旧服务。请关闭旧版服务后重新双击启动脚本，端口占用时改用python serve.py --port 8766。

验证：181项回归通过（内存文档渲染、测试替身与自有HTTP网关）；另在本机Chrome实际HTTP加载网页通过77项浏览器检查。两组存在覆盖重叠，不宣称258项独立能力。
无真实模型API调用，无优化求解，无设备操作。专业算法服务由用户配置后验证。
