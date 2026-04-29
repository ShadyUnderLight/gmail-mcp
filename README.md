# Gmail MCP Server

让 AI 助手通过 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 读取、发送和管理你的 Gmail 邮箱。

## 功能

支持 22 个 MCP 工具，覆盖 Gmail 核心操作：

**查询**
- `get_profile` — 获取邮箱资料（地址、邮件总数等）
- `list_messages` — 列出邮件，支持分页和标签过滤
- `get_message` — 获取单封邮件详情（正文、附件元数据）
- `search_messages` — 用 Gmail 搜索语法搜索邮件
- `get_thread` — 获取完整邮件线程（对话模式）
- `list_threads` — 列出邮件线程
- `get_history` — 获取邮箱变更历史（用于高效同步）

**发送**
- `send_message` — 发送邮件（支持 CC/BCC、纯文本/HTML）
- `create_draft` — 创建草稿
- `list_drafts` — 列出草稿
- `send_draft` — 发送指定草稿

**标签管理**
- `list_labels` — 列出所有标签（系统 + 自定义）
- `create_label` — 创建新标签
- `modify_message` — 修改邮件标签

**邮件操作**
- `mark_as_read` / `mark_as_unread` — 标记已读/未读
- `star_message` / `unstar_message` — 加星/取消星标
- `archive_message` / `move_to_inbox` — 归档/移回收件箱
- `trash_message` / `untrash_message` — 移入/恢复出垃圾箱

> **注意**：`delete_message`（永久删除）**默认禁用**。永久删除需要 `https://mail.google.com/` 范围（敏感权限），本服务器未申请该范围，避免意外数据丢失。

## 快速开始

### 1. 获取 Google OAuth2 凭据

1. 打开 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建一个项目（或选择已有项目）
3. 启用 **Gmail API**
4. 创建 **OAuth 2.0 客户端 ID**，应用类型选"桌面应用"
5. 复制 Client ID 和 Client Secret

### 2. 配置凭据

方式一：环境变量（推荐）

**Windows (cmd):**
```cmd
set GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
set GMAIL_CLIENT_SECRET=your-client-secret
```

**macOS / Linux:**
```bash
export GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GMAIL_CLIENT_SECRET=your-client-secret
```

方式二：凭据文件

将下载的 `credentials.json` 放到：
- Windows: `%USERPROFILE%\.gmail-mcp\credentials.json`
- macOS/Linux: `~/.gmail-mcp/credentials.json`

### 3. 启动

```bash
# 安装依赖
npm install

# 编译
npm run build

# 启动（首次会在终端打印授权 URL）
npm start
```

首次运行会在终端打印授权 URL，**不会自动打开浏览器**。请手动复制 URL 在浏览器中打开完成 Google 账号授权。

授权成功后，Token 会保存在 `~/.gmail-mcp/token.json`，后续启动无需重复授权。

如需重新授权，使用：

```bash
node dist/index.js --reauth
```

### 4. 配置 MCP 客户端

在 MCP 客户端（如 Claude Desktop）的配置文件中添加：

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/path/to/gmail-mcp/dist/index.js"]
    }
  }
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GMAIL_CLIENT_ID` | Google OAuth2 客户端 ID | — |
| `GMAIL_CLIENT_SECRET` | Google OAuth2 客户端密钥 | — |
| `OAUTH_PORT` | OAuth 回调端口 | `3000` |

## 权限范围

本服务器使用的 OAuth2 范围（定义在 `src/auth.ts`）：

- `gmail.modify` — 读写邮件、标签，支持发送（**默认使用**）
- `gmail.compose` — 创建和发送草稿
- `gmail.labels` — 创建和管理标签

**未申请的范围：**
- `https://mail.google.com/` — 完全访问（含永久删除），高危，默认不申请
- `gmail.readonly` — 如需只读可自行切换

> `delete_message` 因需要 `https://mail.google.com/` 范围，**默认已从工具列表中移除**。如需启用，需修改 `src/auth.ts` 中的 `SCOPES`、在 `src/tools.ts` 中恢复工具定义，并理解相应安全风险。

## 项目结构

```
src/
├── index.ts    # 入口：认证 → MCP 服务器
├── auth.ts     # OAuth2 认证流程（带本地回调服务器）
├── gmail.ts    # Gmail API 封装层
├── tools.ts    # MCP 工具定义 + 请求路由
├── types.ts    # 类型定义
└── utils.ts    # 辅助函数
```

## 许可证

MIT
