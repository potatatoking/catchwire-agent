# Catchwire Agent 简体中文社区版

本项目基于 [orilaxnet/catchwire-agent](https://github.com/orilaxnet/catchwire-agent) 的提交 `4e7012cf25bc34e732ca2cfd28c1c0c5a5c9f3dd`。这是非官方简体中文版本，**界面文案由 OpenAI GPT 辅助翻译，并通过构建和部署检查**。欢迎反馈术语和翻译问题。

## 汉化范围

- 产品介绍页、登录、管理员初始化、邮箱连接向导和主要导航。
- 收件箱、优先级、邮件会话、统计、邮件模板、定时邮件、发件人规则、Webhook、插件构建器和提示词调试台。
- 模型与邮箱设置、回复语言名称、常见账号错误、部分状态和操作提示。
- 本地产品首页的入口指向当前实例的管理页面。

## 已知局限

- 当前以简体中文为默认界面，未提供中英文切换。部分示例、动态标签和未收录的服务端错误仍可能显示英文。
- 邮件原文、用户输入、模型及协议名称，以及 AI 或第三方服务生成的内容按原样显示。AI 输出语言仍取决于模型和回复设置。
- 已在 Debian 验证 IMAP 增量收信、DeepSeek 对话和移动端导航。邮件图片支持预览，图片文字识别与附件安全扫描不在此版本的功能范围内。
- 前端生产构建和 Debian 服务健康检查通过。当前隔离环境下 `npm test` 为 35 项通过、23 项失败，结果与原版基线一致。测试失败主要涉及邮件处理、调度及 Webhook 等后端模块。 上游仓库缺少 ESLint 配置，因此 `npm run lint` 无法完成。

## 收件箱与手机端

- IMAP 首次连接时跳过已有邮件，之后保存收件位置，重启后继续收取新邮件。
- 「原始邮件」支持中文 MIME 解码、图片预览和可点击的 HTML 超链接。外链图片需要手动加载，缺少原始数据的旧邮件可能只能在原邮箱查看。
- 手机左上角菜单可切换页面，右上角机器人可打开对话。统一收件箱用于浏览和筛选，切到单个邮箱后可编辑、发送回复或忽略邮件。

## Gmail OAuth

1. 在 Google Cloud 项目中启用 Gmail API，创建类型为「Web 应用」的 OAuth 客户端。如果应用处于测试模式，把要连接的 Gmail 地址添加为测试用户。
2. 在 Google Cloud 的「已获授权的重定向 URI」和 Catchwire 的 `GMAIL_REDIRECT_URI` 中填写同一个地址。回调路径是 `/auth/gmail/callback`。例如，通过本机 13000 端口访问时，填写 `http://127.0.0.1:13000/auth/gmail/callback`。
3. 在服务器的私有 `.env` 中填写 `GMAIL_CLIENT_ID`、`GMAIL_CLIENT_SECRET` 和 `GMAIL_REDIRECT_URI`，然后重启 Catchwire。请勿提交 `.env` 或客户端密钥。
4. 登录 Catchwire，在设置中添加 Gmail 类型的邮箱，再点该账号旁的「OAuth」，在 Google 页面确认授权。

OAuth 启动接口要求登录，并检查 Gmail 账号归属。本次验证覆盖授权链接生成和未登录请求拦截。Gmail 自动收信还需要配置和验证 Pub/Sub，授权本身不会启动收信。

## IMAP 邮箱的 SMTP 发件设置

- 添加 IMAP 邮箱时，可以勾选「同时配置 SMTP 发件」并填写发件服务器、端口、用户名和密码。
- 已添加的 IMAP 邮箱可在「设置 → 邮箱账号」中点「发件设置」单独编辑。留空密码会优先使用 IMAP 密码。
- 新配置使用公网 SMTP 服务器域名。端口 465 使用隐式 TLS，其他端口要求 STARTTLS。IMAP 的「测试连接」只检查收信。
- Gmail OAuth 类型仍使用 Gmail API 发件，这个 SMTP 表单仅用于 IMAP 类型。

- 可为每个 IMAP 邮箱保存最多 20 个发件别名，用逗号或换行分隔。别名需先由邮箱服务商授权。
- 单账号收件箱回复时，可以在「发件人」里选择别名。自动回复仍使用主地址。统一收件箱保持只读。

## 个人 Outlook.com / Hotmail

在 Microsoft Entra 中注册支持个人 Microsoft 账号的 Web 应用，并配置 `OUTLOOK_CLIENT_ID`、`OUTLOOK_CLIENT_SECRET` 和 `OUTLOOK_REDIRECT_URI`。注册的重定向 URI 必须与环境变量完全一致，例如通过本机 13000 端口使用 `http://localhost:13000/auth/outlook/callback`。在 Outlook 网页设置中启用 IMAP，再到 Catchwire 添加 Outlook 邮箱并点「Microsoft OAuth」。此入口用于 IMAP 收信，未申请 Outlook SMTP 发件权限。

对于普通 IMAP 账号，已有邮箱旁的「设置」可以编辑收信和发件参数。SMTP 用户名或密码留空时使用该邮箱的 IMAP 凭据。已保存的密码不会显示在网页上。

## 许可证

保留上游 [Apache-2.0 许可证](LICENSE) 和版权声明。修改过的文件包含简体中文改动说明。上游项目的安装与部署说明见 [原版 README](README.md)。
