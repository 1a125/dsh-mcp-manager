# dsh-mcp-manager

DSH（DeepSeek Harness）全局 MCP 管理器：在 **设置弹窗 →「MCP 管理」** 页面统一管理所有 MCP 服务。

## 功能

- **统一全局管理**：所有 MCP 统一写入宿主级 `~/.dsh/cordis.patch.yml`（`mcp-client` 行），由宿主加载，**任何项目/会话都可调用**，重启后保持。
- **粘贴 JSON 添加**：支持标准 `mcpServers` 格式，一次添加多个服务，无需填写繁琐表单。
- **开关 / 删除**：每个服务的开启/关闭直接修改宿主 cordis 配置（`disabled` 标记），运行期即时连接/断开。
- **状态展示**：已连接状态、工具数量（通过宿主工具注册表实时检测）、错误信息。

## 安装

```sh
dsh plugin --profile web add dsh-mcp-manager
```

或手动：把 `dsh-mcp-manager` 放入 `~/.dsh/profiles/web/node_modules/`，并在 `~/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: mcp-manager
      name: 'dsh-mcp-manager'
```

重启 DSH 后，设置弹窗中会出现「MCP 管理」页面。

## 添加 MCP 示例

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["C:/path/server.js"],
      "env": { "API_KEY": "xxx" }
    }
  }
}
```

仅支持 stdio 传输（`command` 必填）；支持单个 server 配置或 `mcpServers` 多服务格式。

## 技术说明

- Host 半部：官方 [github/mcp SDK](https://github.com/modelcontextprotocol/typescript-sdk) stdio 桥 + `~/.dsh/cordis.patch.yml` 读写 + 工具注册（`mcp__<服务名>__<工具名>`）。
- Client 半部：注册 `settings.section`「MCP 管理」页面（设置弹窗入口）。
- 启动时不做重复连接：宿主已从 cordis.patch.yml 静态加载的服务，通过工具注册表检测状态。

## License

MIT
