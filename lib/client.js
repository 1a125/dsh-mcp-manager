window.__ModuleLoader__.load({
	id: "dsh-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		const css = `
.mcpm-page{height:100%;min-height:0;padding:18px 22px;box-sizing:border-box}
.mcpm-root{display:flex;flex-direction:column;gap:10px;height:100%;min-height:0;box-sizing:border-box;font-size:13px;color:var(--dsw-alias-label-primary,#1f2329)}
.mcpm-body{overflow-y:auto;flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:2px}
.mcpm-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none}
.mcpm-head h3{margin:0;font-size:14px;font-weight:600}
.mcpm-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.mcpm-btn{background:var(--dsw-alias-fill-2,rgba(0,0,0,.04));border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;color:inherit}
.mcpm-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.09))}
.mcpm-btn.primary{background:#3370ff;color:#fff;border-color:transparent}
.mcpm-btn:disabled{opacity:.55;cursor:default}
.mcpm-error{background:rgba(245,63,63,.08);color:var(--dsw-alias-state-error-primary,#f53f3f);border-radius:8px;padding:8px 10px;font-size:12px;word-break:break-word}
.mcpm-notice{background:rgba(51,112,255,.08);color:var(--dsw-alias-label-primary,#1f2329);border-radius:8px;padding:8px 10px;font-size:12px;word-break:break-word}
.mcpm-meta{color:var(--dsw-alias-label-tertiary,#8f959e);font-size:12px}
.mcpm-meta code{font-family:var(--ds-font-family-code,monospace);font-size:11px;word-break:break-all}
.mcpm-server{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:10px;padding:8px 10px}
.mcpm-server-main{flex:1;min-width:0}
.mcpm-server-name{font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mcpm-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
.mcpm-dot.connected{background:#23c343}.mcpm-dot.connecting{background:#ff9a2e}.mcpm-dot.error{background:#f53f3f}.mcpm-dot.disabled,.mcpm-dot.disconnected{background:#b9bdc6}.mcpm-dot.system{background:#3370ff}
.mcpm-server-sub{color:var(--dsw-alias-label-tertiary,#8f959e);font-size:12px;margin-top:2px;word-break:break-all}
.mcpm-server-err{color:var(--dsw-alias-state-error-primary,#f53f3f);font-size:12px;margin-top:2px;word-break:break-word}
.mcpm-toggle{position:relative;width:34px;height:18px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);background:var(--dsw-alias-fill-3,#f2f3f5);cursor:pointer;flex:none;padding:0;transition:background .15s}
.mcpm-toggle[aria-pressed="true"]{background:#23c343;border-color:#23c343}
.mcpm-toggle::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}
.mcpm-toggle[aria-pressed="true"]::after{left:18px}
.mcpm-del{background:none;border:none;color:var(--dsw-alias-label-tertiary,#8f959e);cursor:pointer;font-size:14px;border-radius:6px;width:24px;height:24px;padding:0;flex:none}
.mcpm-del:hover{color:var(--dsw-alias-state-error-primary,#f53f3f);background:rgba(245,63,63,.08)}
.mcpm-section{font-size:12px;color:var(--dsw-alias-label-secondary,#4e5969);font-weight:600;margin-top:4px;flex:none}
.mcpm-form{display:flex;flex-direction:column;gap:8px;border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-fill-2,rgba(0,0,0,.02));flex:none}
.mcpm-field{display:flex;flex-direction:column;gap:4px}
.mcpm-field label{font-size:12px;color:var(--dsw-alias-label-secondary,#4e5969)}
.mcpm-field input,.mcpm-field textarea{background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e6eb);border-radius:8px;padding:6px 8px;font-size:13px;color:inherit;font-family:var(--ds-font-family-code,monospace);resize:vertical}
.mcpm-field input:focus,.mcpm-field textarea:focus{outline:none;border-color:#3370ff}
.mcpm-check{display:flex;align-items:center;gap:6px;font-size:12px}
.mcpm-empty{color:var(--dsw-alias-label-tertiary,#8f959e);font-size:12px;padding:8px 2px}
.mcpm-hint{color:var(--dsw-alias-label-tertiary,#8f959e);font-size:11px;line-height:1.6}
`;
		const tagId = "dsh-mcp-manager/module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mcp-manager";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		const STATUS_LABEL = { connected: "已连接", connecting: "连接中…", error: "异常", enabled: "已启用", disabled: "已停用", disconnected: "未连接" };
		const STATUS_CLASS = { connected: "connected", connecting: "connecting", error: "error", enabled: "system", disabled: "disabled", disconnected: "disconnected" };
		const JSON_PLACEHOLDER = '{\n  "mcpServers": {\n    "my-server": {\n      "command": "node",\n      "args": ["C:/path/server.js"],\n      "env": { "API_KEY": "xxx" }\n    }\n  }\n}';

		function api(path, method, body) {
			const opts = { method, headers: { "Content-Type": "application/json" } };
			if (body !== undefined) opts.body = JSON.stringify(body);
			return fetch(path, opts).then(async (res) => {
				let data = null;
				try { data = await res.json(); } catch (e) {}
				if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
				return data;
			});
		}

		function McpManagerTab() {
			const [data, setData] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [notice, setNotice] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [addOpen, setAddOpen] = react.useState(false);
			const [busyId, setBusyId] = react.useState("");
			const [jsonText, setJsonText] = react.useState("");
			const [jsonEnabled, setJsonEnabled] = react.useState(true);

			const load = react.useCallback(() => {
				setBusy(true);
				api("/mcp-manager/api/state", "GET").then((d) => { setData(d); setError(null); }).catch((e) => setError(String((e && e.message) || e))).finally(() => setBusy(false));
			}, []);
			react.useEffect(() => { load(); }, [load]);
			react.useEffect(() => {
				const timer = window.setInterval(load, 5000);
				return () => window.clearInterval(timer);
			}, [load]);

			const run = (path, body) => {
				setBusyId(path + (body && body.id ? ":" + body.id : ""));
				return api(path, "POST", body).then((d) => {
					setData(d); setError(null);
					if (d && d.message) setNotice(d.message);
				}).catch((e) => setError(String((e && e.message) || e))).finally(() => setBusyId(""));
			};
			const toggle = (s) => run("/mcp-manager/api/set-enabled", { id: s.id, enabled: !s.enabled });
			const remove = (s) => {
				if (!window.confirm("确定删除 MCP「" + s.name + "」？其已注册的工具会立即移除。")) return;
				run("/mcp-manager/api/remove", { id: s.id });
			};
			const submitJson = () => {
				if (!jsonText.trim()) { setError("请先粘贴 MCP 配置 JSON"); return; }
				setBusyId("add-json");
				api("/mcp-manager/api/add-json", "POST", { text: jsonText, enabled: jsonEnabled }).then((d) => {
					setData(d); setError(null);
					const parts = [];
					if (d.added && d.added.length) parts.push("已添加：" + d.added.join("、"));
					if (d.errors && d.errors.length) parts.push("失败：" + d.errors.join("；"));
					setNotice(parts.join(" "));
					if (d.added && d.added.length) setJsonText("");
				}).catch((e) => setError(String((e && e.message) || e))).finally(() => setBusyId(""));
			};

			const servers = (data && data.servers) || [];
			const connectedCount = servers.filter((s) => s.status === "connected").length;

			return react.createElement("div", { className: "mcpm-root" }, [
				react.createElement("div", { className: "mcpm-head", key: "head" }, [
					react.createElement("h3", { key: "t" }, "MCP 管理"),
					react.createElement("div", { className: "mcpm-actions", key: "a" }, [
						react.createElement("button", { className: "mcpm-btn", key: "r", onClick: load, disabled: busy }, busy ? "刷新中…" : "刷新"),
						react.createElement("button", { className: "mcpm-btn primary", key: "add", onClick: () => setAddOpen(!addOpen) }, addOpen ? "收起" : "＋ 添加 MCP")
					])
				]),
				react.createElement("div", { className: "mcpm-meta", key: "meta" },
					"已连接 " + connectedCount + " / " + servers.length + " 个 · 全局配置: ",
					react.createElement("code", null, (data && data.storage) || "cordis.patch.yml")),
				error ? react.createElement("div", { className: "mcpm-error", key: "err" }, String(error)) : null,
				notice ? react.createElement("div", { className: "mcpm-notice", key: "notice" }, notice) : null,
				addOpen ? react.createElement("div", { className: "mcpm-form", key: "form" }, [
					react.createElement("div", { className: "mcpm-field" }, [
						react.createElement("label", null, "粘贴 MCP 配置 JSON（支持 mcpServers 格式，可一次添加多个）"),
						react.createElement("textarea", { rows: 7, spellCheck: false, placeholder: JSON_PLACEHOLDER, value: jsonText, onChange: (e) => setJsonText(e.target.value) })
					]),
					react.createElement("label", { className: "mcpm-check" }, [
						react.createElement("input", { type: "checkbox", checked: jsonEnabled, onChange: (e) => setJsonEnabled(e.target.checked) }),
						"添加后立即启用"
					]),
					react.createElement("div", { className: "mcpm-actions" }, [
						react.createElement("button", { className: "mcpm-btn primary", disabled: !!busyId || !jsonText.trim(), onClick: submitJson }, busyId === "add-json" ? "添加中…" : "添加"),
						react.createElement("button", { className: "mcpm-btn", onClick: () => setAddOpen(false) }, "取消")
					]),
					react.createElement("div", { className: "mcpm-hint" }, "格式示例：{ \"mcpServers\": { \"服务名\": { \"command\": \"node\", \"args\": [\"...\"], \"env\": { \"KEY\": \"VALUE\" } } } }（仅支持 stdio，command 必填）")
				]) : null,
				react.createElement("div", { className: "mcpm-section", key: "sec1" }, "我的 MCP（全局 · 写入宿主 cordis.patch.yml）"),
				servers.length === 0
					? react.createElement("div", { className: "mcpm-empty", key: "empty1" }, "还没有 MCP 服务，点击「＋ 添加 MCP」粘贴 JSON 配置")
					: null,
				servers.map((s) => react.createElement("div", { className: "mcpm-server", key: s.id }, [
					react.createElement("div", { className: "mcpm-server-main", key: "main" }, [
						react.createElement("div", { className: "mcpm-server-name" }, [
							react.createElement("span", { className: "mcpm-dot " + (STATUS_CLASS[s.status] || "disconnected") }),
							react.createElement("span", null, s.name),
							react.createElement("span", { className: "mcpm-meta" }, "[" + (STATUS_LABEL[s.status] || s.status) + (s.toolCount ? " · " + s.toolCount + " 个工具" : "") + "]")
						]),
						react.createElement("div", { className: "mcpm-server-sub" }, s.command + (s.args.length ? " " + s.args.join(" ") : "") + (s.envKeys.length ? " · env: " + s.envKeys.join(", ") : "")),
						s.error ? react.createElement("div", { className: "mcpm-server-err" }, s.error) : null
					]),
					react.createElement("button", { className: "mcpm-toggle", "aria-pressed": s.enabled ? "true" : "false", title: s.enabled ? "点击停用" : "点击启用", disabled: !!busyId, onClick: () => toggle(s) }),
					react.createElement("button", { className: "mcpm-del", title: "删除", disabled: !!busyId, onClick: () => remove(s) }, "×")
				])),
				react.createElement("div", { className: "mcpm-hint", key: "hint" }, "所有 MCP 统一为全局配置，写入 ~/.dsh/cordis.patch.yml（宿主级），重启后由宿主自动加载，任何项目/会话都可调用；开关与删除即时生效，重启后保持。"),
				react.createElement("button", { className: "mcpm-btn", key: "reload", onClick: () => run("/mcp-manager/api/refresh", {}) }, "重新加载配置")
			]);
		}

		function McpSettingsPage() {
			return react.createElement("div", { className: "mcpm-page" }, react.createElement(McpManagerTab, null));
		}

		const inject = ["slots"];

		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mcp-manager",
				order: 50,
				label: () => "MCP 管理"
			}, McpSettingsPage));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
