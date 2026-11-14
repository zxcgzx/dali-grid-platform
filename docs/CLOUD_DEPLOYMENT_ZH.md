# 平台A完整演示版云部署

部署版本为 releases/v051-platform-a，保留九模块、参数编译和 SciPy/HiGHS 四节点真实求解。本机启动脚本继续使用 serve_demo.py。

## GitHub 与 Render

1. 在 GitHub 创建公开仓库 dali-grid-platform，将经过筛选的项目文件提交。不要上传 .env、密钥、浏览器测试目录或历史参考材料。
2. 登录 Render，连接该 GitHub 仓库，选择 New → Blueprint，使用根目录 render.yaml 创建免费 Web Service。
3. 构建安装 requirements.txt，启动 serve_cloud.py。网页入口由后端直接提供，不使用根目录本机启动提示页。
4. 服务状态变为 Live 后，打开 Render 分配的 HTTPS 网址。
5. 按当前用户要求，默认无需密码，任何获得链接的人都能访问。以后若需要密码，可在 Environment 设置 DALI_ACCESS_PASSWORD，用户名为 demo。不要提交密码或写入网页。

## 模型 API

页面和四节点真实求解不需要 LLM API。真实自然语言解析需访客填写自己的模型地址、模型名和密钥，服务商可能另外收费。

网关模式需在 Render 环境变量 DALI_API_ALLOWED_HOSTS 中填写实际 API 主机名，用英文逗号分隔，不带协议和路径。默认为空，网关不向任何上游转发。云端只允许公开 HTTPS API；不允许内网地址。不要设置 DALI_PRIMARY_API_KEY 等共享模型密钥。

## 使用限制

免费套餐的休眠、用量和资源限制以 Render 当时的官方说明为准。适合小范围演示，不承诺20人同时求解；现有求解锁仅允许一个求解任务，忙时其他访客稍后重试。站点重启会刷新会话令牌，刷新页面后重试。

没有服务端持久化用户数据库或云端文件存储。浏览器本地保存的数据不会自动跨用户共享。当前真实求解仅限四节点无损运输网络示例；其他求解器和业务算法仍需接入。

## 本地验证

python -m unittest discover -s tests -p test_cloud_deployment.py

测试覆盖访问密码、云端来源校验、静态资源、模型 API 主机限制、参数编译和真实求解。
