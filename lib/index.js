// dsh-mcp-manager host half
// 全局 MCP 管理器：所有 MCP 统一写入宿主级 ~/.dsh/cordis.patch.yml（mcp-client 行），
// 由宿主统一管理，重启后全局生效（不同项目/会话共享）。运行期用官方 MCP SDK 桥
// 提供即时连接/开关，并把服务工具注册到 ctx.tools（mcp__<服务名>__<工具名>）。
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListToolsResultSchema, ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

export const name = 'mcp-manager';
export const inject = ['tools', 'webServer'];

const COMPOSITION_PATH = join(homedir(), '.dsh', 'cordis.patch.yml');
const MCP_CLIENT_PACKAGE = '@deepseek-ai/dsh-mcp-client';
const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_PUBLIC_NAME_LENGTH = 64;
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g;
const HASH_LENGTH = 12;
const DEFAULT_TIMEOUT_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 8;
const RawCallToolResultSchema = z.record(z.string(), z.unknown());

function publicToolName(serverName, rawName) {
  const joined = `mcp__${serverName}__${rawName}`;
  const normalized = joined.replace(INVALID_NAME_CHARS, '_');
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized;
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH);
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`;
}

function extractText(mcpContent, toolName) {
  const parts = [];
  const list = Array.isArray(mcpContent) ? mcpContent : [];
  for (const value of list) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      parts.push('[unsupported content type: unknown]');
      continue;
    }
    const block = value;
    switch (block.type) {
      case 'text':
        if (typeof block.text === 'string') parts.push(block.text);
        break;
      case 'image':
        parts.push('[image: content discarded]');
        break;
      case 'audio':
        parts.push('[audio: content discarded]');
        break;
      case 'resource':
      case 'resource_link':
        parts.push('[resource: content discarded]');
        break;
      default:
        parts.push(`[unsupported content type: ${String(block.type)}]`);
    }
  }
  return parts.join('\n') || `(${toolName} returned no text content)`;
}

function createOutput(rawName) {
  return {
    schema: {
      type: 'object',
      properties: { content: { type: 'array', items: {} }, structuredContent: {} },
      required: ['content'],
      additionalProperties: false
    },
    render(_args, value) {
      const content = value && Array.isArray(value.content) ? value.content : [];
      return [{ type: 'text', text: extractText(content, rawName) }];
    }
  };
}

// ---- YAML 工具（针对 cordis.patch.yml 中 mcp-client 行的解析与生成） ----

// YAML 标量：仅安全字符裸写，否则单引号（'' 转义内部单引号）
function yamlStr(value) {
  const s = String(value);
  if (s === '') return "''";
  if (/^[A-Za-z0-9_/.\-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

// 解析 cordis.patch.yml 顶层结构：'  - insert:' 列表下的 '    - id: X' 块（带行号范围）
function parseCompositionBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/^(\s*)- id:\s*(.+)$/);
    if (idMatch) {
      const ind = idMatch[1].length;
      if (current && ind <= current.indent) {
        blocks.push(current);
        current = null;
      }
      current = {
        id: idMatch[2].trim().replace(/^['"]|['"]$/g, ''),
        indent: ind,
        start: i,
        end: i,
        lines: [line],
        name: '',
        disabled: false,
        config: {},
        inConfig: false,
        lastKey: null,
        envIndent: -1
      };
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      current.lines.push(line);
      current.end = i;
      continue;
    }
    const indentLen = (line.match(/^\s*/) || [''])[0].length;
    // env 子键（比 env: 行缩进更深，形如 KEY: value）优先于普通 key 解析
    if (current.inConfig && current.lastKey === 'env' && indentLen > current.envIndent) {
      const em = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
      if (em) {
        if (!current.config.env || typeof current.config.env !== 'object') current.config.env = {};
        current.config.env[em[1]] = em[2].trim().replace(/^['"]|['"]$/g, '');
        current.lines.push(line);
        current.end = i;
        continue;
      }
    }
    const keyMatch = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch && !trimmed.startsWith('-')) {
      const key = keyMatch[1];
      const val = keyMatch[2].trim().replace(/^['"]|['"]$/g, '');
      if (key === 'config') {
        current.inConfig = true;
        current.lastKey = 'config';
      } else if (key === 'disabled') {
        current.disabled = val === 'true';
        current.lastKey = 'disabled';
      } else if (key === 'name') {
        current.name = val;
        current.lastKey = 'name';
      } else if (current.inConfig) {
        current.config[key] = val;
        current.lastKey = key;
        if (key === 'env') current.envIndent = indentLen;
      } else {
        current.lastKey = key;
      }
      current.lines.push(line);
      current.end = i;
      continue;
    }
    // args / env 子行
    if (current.inConfig && current.lastKey === 'args') {
      const am = line.match(/^\s*-\s*(.*)$/);
      if (am) {
        if (!Array.isArray(current.config.args)) current.config.args = [];
        current.config.args.push(am[1].trim().replace(/^['"]|['"]$/g, ''));
      }
      current.lines.push(line);
      current.end = i;
      continue;
    }
    if (current.inConfig && current.lastKey === 'env') {
      const em = line.match(/^\s*([A-Za-z0-9_-]+):\s*(.*)$/);
      if (em) {
        if (!current.config.env || typeof current.config.env !== 'object') current.config.env = {};
        current.config.env[em[1]] = em[2].trim().replace(/^['"]|['"]$/g, '');
      }
      current.lines.push(line);
      current.end = i;
      continue;
    }
    current.lines.push(line);
    current.end = i;
  }
  if (current) blocks.push(current);
  return blocks;
}

function isMcpClientBlock(block) {
  return block.name === MCP_CLIENT_PACKAGE || (block.config && typeof block.config.serverName === 'string' && SERVER_NAME_PATTERN.test(block.config.serverName));
}

function blockToServer(block) {
  const config = block.config || {};
  return {
    id: block.id,
    name: String(config.serverName || block.id || ''),
    command: String(config.command || ''),
    args: Array.isArray(config.args) ? config.args.map(String) : [],
    env: config.env && typeof config.env === 'object' ? Object.assign({}, config.env) : {},
    cwd: typeof config.cwd === 'string' ? config.cwd : '',
    enabled: !block.disabled,
    toolCallTimeoutMs: Number(config.toolCallTimeoutMs) > 0 ? Number(config.toolCallTimeoutMs) : DEFAULT_TIMEOUT_MS,
    entryId: block.id,
    entryLines: block.lines
  };
}

// 生成一个 mcp-client 块文本（缩进 4 空格，对应 '- insert:' 的子列表项）
function buildMcpClientBlock(server) {
  const lines = [];
  lines.push(`    - id: ${server.entryId || ('mcp-' + server.name)}`);
  lines.push(`      name: '${MCP_CLIENT_PACKAGE}'`);
  if (server.enabled === false) lines.push('      disabled: true');
  lines.push('      config:');
  lines.push(`        serverName: ${yamlStr(server.name)}`);
  lines.push('        transport: stdio');
  lines.push(`        command: ${yamlStr(server.command)}`);
  if (server.args && server.args.length) {
    lines.push('        args:');
    for (const arg of server.args) lines.push(`          - ${yamlStr(arg)}`);
  }
  if (server.env && Object.keys(server.env).length) {
    lines.push('        env:');
    for (const key of Object.keys(server.env)) lines.push(`          ${key}: ${yamlStr(server.env[key])}`);
  }
  if (server.cwd) lines.push(`        cwd: ${yamlStr(server.cwd)}`);
  return lines.join('\n');
}

// 解析粘贴的 MCP 配置 JSON：支持 { "mcpServers": { "<名称>": {...} } } 或单个 { command, args, env }
function parseServersJson(input) {
  const parsed = JSON.parse(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON 必须是对象');
  }
  const out = [];
  if (parsed.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)) {
    for (const name of Object.keys(parsed.mcpServers)) {
      const conf = parsed.mcpServers[name];
      if (conf && typeof conf === 'object' && !Array.isArray(conf)) {
        out.push(Object.assign({ name }, conf));
      }
    }
    if (out.length === 0) throw new Error('mcpServers 中没有服务配置');
  } else if (typeof parsed.command === 'string' || typeof parsed.url === 'string') {
    out.push(parsed);
  } else {
    throw new Error('无法识别的格式：需要 { "mcpServers": { "<名称>": { command, args, env } } } 或单个 { command, args, env }');
  }
  return out;
}

function buildServerSpec(spec, enabled) {
  const serverName = String(spec.name || '').trim();
  if (!SERVER_NAME_PATTERN.test(serverName)) throw new Error(`名称「${serverName || '(空)'}」仅支持 1-32 位字母/数字/下划线/中划线`);
  const command = String(spec.command || '').trim();
  if (!command) throw new Error(`「${serverName}」缺少 command（仅支持 stdio 传输）`);
  return {
    name: serverName,
    command,
    args: Array.isArray(spec.args) ? spec.args.map(String).filter(Boolean) : [],
    env: (spec.env && typeof spec.env === 'object' && !Array.isArray(spec.env)) ? Object.assign({}, spec.env) : {},
    cwd: typeof spec.cwd === 'string' ? spec.cwd : '',
    enabled: enabled !== false,
    toolCallTimeoutMs: Number(spec.toolCallTimeoutMs) > 0 ? Number(spec.toolCallTimeoutMs) : DEFAULT_TIMEOUT_MS
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

class McpManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.servers = [];
    this.bridges = new Map();
    this.writeChain = Promise.resolve();
  }

  async init() {
    await this.loadServers();
    // 启动时不做桥连接：cordis.patch.yml 中启用的服务由宿主静态 mcp-client 实例加载，
    // 状态通过 tools.schemas() 检测工具判定；桥只负责运行期用户操作的即时连接。
  }

  async loadServers() {
    this.servers = [];
    try {
      const text = await readFile(COMPOSITION_PATH, 'utf8');
      const blocks = parseCompositionBlocks(text);
      for (const block of blocks) {
        if (isMcpClientBlock(block)) {
          const server = blockToServer(block);
          if (server.name && SERVER_NAME_PATTERN.test(server.name)) this.servers.push(server);
        }
      }
    } catch (e) {
      console.error('mcp-manager: composition load failed:', String((e && e.message) || e));
    }
  }

  // 将当前 servers 列表整体写回 cordis.patch.yml：剥离旧 mcp-client 块，保留其余内容，重写新块
  async persistToComposition() {
    this.writeChain = this.writeChain.then(async () => {
      try {
        const text = await readFile(COMPOSITION_PATH, 'utf8');
        const newline = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(/\r?\n/);
        const blocks = parseCompositionBlocks(text);
        const drop = new Set();
        for (const b of blocks) {
          if (isMcpClientBlock(b)) {
            for (let i = b.start; i <= b.end; i++) drop.add(i);
          }
        }
        let insertIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim() === '- insert:') {
            insertIdx = i;
            break;
          }
        }
        const mcpLines = this.servers.map((s) => buildMcpClientBlock(s));
        if (insertIdx === -1) {
          await writeFile(COMPOSITION_PATH, '- insert:' + newline + mcpLines.join(newline) + newline, 'utf8');
          return;
        }
        const out = [];
        for (let i = 0; i <= insertIdx; i++) out.push(lines[i]);
        for (const block of mcpLines) out.push(block);
        for (let i = insertIdx + 1; i < lines.length; i++) {
          if (drop.has(i)) continue;
          out.push(lines[i]);
        }
        await writeFile(COMPOSITION_PATH, out.join(newline) + newline, 'utf8');
      } catch (e) {
        console.error('mcp-manager: composition persist failed:', String((e && e.message) || e));
      }
    });
    return this.writeChain;
  }

  // 用 tools.schemas() 检测某服务当前已注册的工具数（判定宿主静态实例的连接状态）
  countTools(serverName) {
    try {
      const prefix = 'mcp__' + serverName + '__';
      const schemas = this.ctx.tools.schemas();
      if (!Array.isArray(schemas)) return 0;
      return schemas.filter((s) => s && typeof s.name === 'string' && s.name.startsWith(prefix)).length;
    } catch (e) {
      return 0;
    }
  }

  snapshot() {
    return {
      storage: COMPOSITION_PATH,
      servers: this.servers.map((s) => {
        const b = this.bridges.get(s.id);
        let status;
        let toolCount = 0;
        let error = null;
        if (b) {
          status = b.status;
          toolCount = b.toolCount;
          error = b.error;
        } else if (s.enabled) {
          toolCount = this.countTools(s.name);
          status = toolCount > 0 ? 'connected' : 'enabled';
        } else {
          status = 'disabled';
        }
        return {
          id: s.id,
          name: s.name,
          transport: 'stdio',
          command: s.command,
          args: s.args,
          cwd: s.cwd,
          envKeys: Object.keys(s.env || {}),
          toolCallTimeoutMs: s.toolCallTimeoutMs,
          enabled: !!s.enabled,
          status,
          toolCount,
          error,
          global: true
        };
      })
    };
  }

  ensureBridge(server) {
    let b = this.bridges.get(server.id);
    if (!b) {
      b = {
        status: server.enabled ? 'disconnected' : 'disabled',
        error: null,
        toolCount: 0,
        client: undefined,
        tools: new Map(),
        attempts: 0,
        connectedAt: 0,
        disposed: false,
        reconnectTimer: undefined
      };
      this.bridges.set(server.id, b);
    }
    return b;
  }

  unregisterTools(bridge) {
    for (const dispose of bridge.tools.values()) {
      try { dispose(); } catch (e) {}
    }
    bridge.tools.clear();
    bridge.toolCount = 0;
  }

  async listTools(client) {
    const all = [];
    let cursor;
    do {
      const response = await client.request(
        { method: 'tools/list', ...(cursor !== undefined ? { params: { cursor } } : {}) },
        ListToolsResultSchema
      );
      if (response && Array.isArray(response.tools)) all.push(...response.tools);
      cursor = response && response.nextCursor;
    } while (cursor);
    return all;
  }

  async syncTools(server, bridge, client, toolList) {
    this.unregisterTools(bridge);
    for (const tool of toolList) {
      if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string') continue;
      const publicName = publicToolName(server.name, tool.name);
      if (bridge.tools.has(publicName)) continue;
      try {
        const disposer = this.ctx.tools.register({
          name: publicName,
          description: typeof tool.description === 'string' ? tool.description : '',
          parameters: tool.inputSchema,
          output: createOutput(tool.name),
          execute: async (args, exec) => {
            const result = await client.request(
              {
                method: 'tools/call',
                params: { name: tool.name, arguments: (typeof args === 'object' && args !== null) ? args : {} }
              },
              RawCallToolResultSchema,
              { signal: exec.signal, timeout: server.toolCallTimeoutMs || DEFAULT_TIMEOUT_MS }
            );
            if (result && result.isError === true) throw new Error(extractText(result.content, tool.name) || `MCP 工具执行失败: ${tool.name}`);
            const out = { content: Array.isArray(result && result.content) ? result.content : [] };
            if (result && result.structuredContent !== undefined) out.structuredContent = result.structuredContent;
            return out;
          }
        });
        bridge.tools.set(publicName, disposer);
      } catch (e) {
        console.error('mcp-manager: tool register failed', publicName, String((e && e.message) || e));
      }
    }
    bridge.toolCount = bridge.tools.size;
  }

  scheduleReconnect(server, bridge) {
    if (bridge.reconnectTimer || !server.enabled || bridge.disposed) return;
    if (bridge.connectedAt && Date.now() - bridge.connectedAt > 30000) bridge.attempts = 0;
    bridge.attempts += 1;
    if (bridge.attempts > MAX_RECONNECT_ATTEMPTS) {
      bridge.status = 'error';
      bridge.error = '重连次数过多，已停止自动重试（可手动重新连接）';
      return;
    }
    const delay = Math.min(15000, 500 * 2 ** (bridge.attempts - 1));
    bridge.status = 'connecting';
    bridge.error = `连接失败，${Math.round(delay / 1000)}s 后重试 (${bridge.attempts}/${MAX_RECONNECT_ATTEMPTS})`;
    bridge.reconnectTimer = setTimeout(() => {
      bridge.reconnectTimer = undefined;
      this.connect(server).catch(() => {});
    }, delay);
  }

  async connect(server) {
    if (!server.enabled) return;
    const bridge = this.ensureBridge(server);
    if (bridge.disposed) bridge.disposed = false;
    if (bridge.client) return;
    bridge.status = 'connecting';
    bridge.error = null;
    const client = new Client({ name: 'dsh-mcp-manager', version: '0.1.0' }, { capabilities: {} });
    bridge.client = client;
    client.onclose = () => {
      if (bridge.disposed || !server.enabled) return;
      this.unregisterTools(bridge);
      bridge.client = undefined;
      bridge.status = 'error';
      bridge.error = '连接已断开';
      this.scheduleReconnect(server, bridge);
    };
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      try {
        const tools = await this.listTools(client);
        await this.syncTools(server, bridge, client, tools);
      } catch (e) {
        console.error('mcp-manager: tool re-sync failed', server.name, String((e && e.message) || e));
      }
    });
    try {
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: Object.assign({}, server.env),
        ...(server.cwd ? { cwd: server.cwd } : {})
      });
      await client.connect(transport);
      const tools = await this.listTools(client);
      await this.syncTools(server, bridge, client, tools);
      if (bridge.disposed || bridge.client !== client) return;
      bridge.status = 'connected';
      bridge.error = null;
      bridge.connectedAt = Date.now();
      bridge.attempts = 0;
      bridge.toolCount = bridge.tools.size;
    } catch (e) {
      try { await client.close(); } catch (e2) {}
      if (bridge.client === client) bridge.client = undefined;
      this.unregisterTools(bridge);
      if (bridge.disposed || !server.enabled) {
        bridge.status = 'disabled';
        return;
      }
      bridge.status = 'error';
      bridge.error = String((e && e.message) || e);
      this.scheduleReconnect(server, bridge);
    }
  }

  disconnect(id) {
    const bridge = this.bridges.get(id);
    if (!bridge) return;
    bridge.disposed = true;
    if (bridge.reconnectTimer) {
      clearTimeout(bridge.reconnectTimer);
      bridge.reconnectTimer = undefined;
    }
    this.unregisterTools(bridge);
    if (bridge.client) {
      const client = bridge.client;
      bridge.client = undefined;
      client.close().catch(() => {});
    }
    bridge.status = 'disabled';
  }

  // 粘贴 JSON 批量添加（mcpServers 格式或单个 server 格式）→ 写入 cordis.patch.yml + 即时连接
  async addJson(argsRaw) {
    const args = (argsRaw && typeof argsRaw === 'object') ? argsRaw : {};
    const text = String(args.text || '').trim();
    if (!text) throw new Error('请粘贴 MCP 配置 JSON');
    let specs;
    try {
      specs = parseServersJson(text);
    } catch (e) {
      throw new Error('JSON 解析失败：' + String((e && e.message) || e));
    }
    const enabled = args.enabled !== false;
    const added = [];
    const errors = [];
    for (const spec of specs) {
      try {
        const server = buildServerSpec(spec, enabled);
        if (this.servers.some((s) => s.name === server.name)) throw new Error(`名称已存在：${server.name}`);
        server.id = 'mcp-' + server.name;
        server.entryId = server.id;
        this.servers.push(server);
        added.push(server.name);
      } catch (e) {
        errors.push(String((e && e.message) || e));
      }
    }
    if (added.length === 0) {
      throw new Error('没有成功添加任何服务：' + errors.join('；'));
    }
    await this.persistToComposition();
    for (const s of this.servers) {
      if (added.includes(s.name) && s.enabled) this.connect(s).catch(() => {});
    }
    return Object.assign({ added, errors }, this.snapshot());
  }

  // 开关任意 MCP（写 cordis.patch.yml disabled + 桥即时连接/断开）
  async setEnabled(argsRaw) {
    const args = (argsRaw && typeof argsRaw === 'object') ? argsRaw : {};
    const server = this.servers.find((s) => s.id === args.id || s.name === args.id);
    if (!server) throw new Error('未找到该 MCP');
    server.enabled = !!args.enabled;
    await this.persistToComposition();
    if (server.enabled) {
      const bridge = this.bridges.get(server.id);
      if (bridge) bridge.disposed = false;
      this.connect(server).catch(() => {});
    } else {
      this.disconnect(server.id);
    }
    return this.snapshot();
  }

  // 删除 MCP：从 cordis.patch.yml 移除 + 断开桥
  async remove(argsRaw) {
    const args = (argsRaw && typeof argsRaw === 'object') ? argsRaw : {};
    const idx = this.servers.findIndex((s) => s.id === args.id || s.name === args.id);
    if (idx < 0) throw new Error('未找到该 MCP');
    this.disconnect(this.servers[idx].id);
    this.servers.splice(idx, 1);
    this.bridges.delete(args.id);
    await this.persistToComposition();
    return this.snapshot();
  }

  async refresh() {
    for (const s of this.servers) this.disconnect(s.id);
    this.bridges.clear();
    await this.loadServers();
    return this.snapshot();
  }

  dispose() {
    for (const s of this.servers) this.disconnect(s.id);
  }
}

async function handleApi(req, res, expectedMethod, run) {
  const send = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };
  try {
    if (req.method !== expectedMethod) {
      send(405, { error: 'method not allowed' });
      return;
    }
    let body = {};
    if (expectedMethod === 'POST') {
      const raw = await readBody(req);
      if (raw) {
        try { body = JSON.parse(raw); } catch (e) {
          send(400, { error: 'invalid json body' });
          return;
        }
      }
    }
    const result = await run(body);
    send(200, result);
  } catch (e) {
    send(400, { error: String((e && e.message) || e) });
  }
}

export function apply(ctx) {
  const manager = new McpManager(ctx);
  ctx.effect(() => () => manager.dispose(), 'mcp-manager: dispose');
  const routes = [
    ['/mcp-manager/api/state', 'GET', () => manager.snapshot()],
    ['/mcp-manager/api/add-json', 'POST', (body) => manager.addJson(body)],
    ['/mcp-manager/api/set-enabled', 'POST', (body) => manager.setEnabled(body)],
    ['/mcp-manager/api/remove', 'POST', (body) => manager.remove(body)],
    ['/mcp-manager/api/refresh', 'POST', () => manager.refresh()]
  ];
  for (const [path, method, run] of routes) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path,
      handler: (req, res) => handleApi(req, res, method, run)
    }), `mcp-manager: route ${path}`);
  }

  manager.init().catch((e) => console.error('mcp-manager: startup failed:', String((e && e.message) || e)));
}
