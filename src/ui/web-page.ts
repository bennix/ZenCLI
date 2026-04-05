// ============================================================
// zen-cli  —  Full IDE Chat UI
// ============================================================
// 3-panel layout: File Tree | Code Editor | Chat
// Features: i18n, dark/light theme, provider switch, syntax highlight

export function getHtmlPage(): string {
  return String.raw`<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>zen-cli</title>
<link rel="stylesheet" href="/vendor/hljs/atom-one-dark.min.css" id="hljs-dark-theme">
<link rel="stylesheet" href="/vendor/hljs/atom-one-light.min.css" id="hljs-light-theme" disabled>
<link rel="stylesheet" href="/modules/@xterm/xterm/css/xterm.css">
<link rel="stylesheet" href="/modules/katex/dist/katex.min.css">
<script src="/vendor/hljs/highlight.min.js"></script>
<script src="/modules/katex/dist/katex.min.js"></script>
<script src="/modules/katex/dist/contrib/auto-render.min.js"></script>
<script src="/modules/@xterm/xterm/lib/xterm.js"></script>
<script src="/modules/@xterm/addon-fit/lib/addon-fit.js"></script>
<style>
/* ===================== CSS Variables ===================== */
:root, [data-theme="dark"] {
  --bg:          #1a1b26;
  --bg2:         #24283b;
  --bg3:         #292e42;
  --text:        #c0caf5;
  --text-dim:    #565f89;
  --accent:      #7aa2f7;
  --green:       #9ece6a;
  --yellow:      #e0af68;
  --red:         #f7768e;
  --orange:      #ff9e64;
  --border:      #3b4261;
  --editor-bg:   #1e1e2e;
  --editor-ln:   #3b4261;
  --terminal-bg: #11131a;
  --scrollbar:   #3b4261;
}
[data-theme="light"] {
  --bg:          #f5f5f5;
  --bg2:         #ffffff;
  --bg3:         #eaeaea;
  --text:        #24292e;
  --text-dim:    #8b949e;
  --accent:      #0969da;
  --green:       #1a7f37;
  --yellow:      #9a6700;
  --red:         #cf222e;
  --orange:      #bc4c00;
  --border:      #d0d7de;
  --editor-bg:   #ffffff;
  --editor-ln:   #d0d7de;
  --terminal-bg: #ffffff;
  --scrollbar:   #d0d7de;
}

/* ===================== Reset ===================== */
* { margin:0; padding:0; box-sizing:border-box; }
html, body { height:100%; background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',system-ui,sans-serif; font-size:13px; }

/* ===================== Layout ===================== */
#app { display:flex; flex-direction:column; height:100vh; }

/* -- Header -- */
#header {
  display:flex; align-items:center; justify-content:space-between;
  padding:6px 12px 6px 80px; border-bottom:1px solid var(--border); background:var(--bg2);
  flex-shrink:0; gap:8px; min-height:38px;
  -webkit-app-region: drag;
}
.hdr-left, .hdr-right { display:flex; align-items:center; gap:8px; -webkit-app-region: no-drag; }
.logo { font-family:monospace; font-size:15px; font-weight:700; color:var(--accent); white-space:nowrap; }
.logo small { color:var(--text-dim); font-weight:400; font-size:11px; margin-left:4px; }

/* provider pills */
.pill { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:10px;
  font-size:11px; font-family:monospace; border:1px solid var(--border); cursor:pointer;
  color:var(--text-dim); background:var(--bg); transition:all .15s; }
.pill:hover { border-color:var(--accent); color:var(--text); }
.pill.active { border-color:var(--green); color:var(--green); }
.pill.unavailable { opacity:.4; cursor:not-allowed; }
.pill .dot { width:5px; height:5px; border-radius:50%; background:var(--text-dim); }
.pill.active .dot { background:var(--green); }
.pill.unavailable .dot { background:var(--red); }

.model-lbl { font-family:monospace; font-size:11px; color:var(--text-dim); max-width:180px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* icon buttons */
.icon-btn { background:none; border:1px solid var(--border); border-radius:4px; color:var(--text-dim);
  cursor:pointer; padding:2px 6px; font-size:13px; transition:all .15s; font-family:monospace; }
.icon-btn:hover { border-color:var(--accent); color:var(--text); }

/* -- Main 3-panel -- */
#main { display:flex; flex:1; overflow:hidden; }
.panel-resizer {
  position:relative; width:8px; flex:0 0 8px; cursor:col-resize;
  background:transparent; user-select:none; touch-action:none;
}
.panel-resizer::before {
  content:''; position:absolute; top:0; bottom:0; left:50%;
  width:1px; transform:translateX(-50%); background:var(--border);
  transition:background .15s ease, box-shadow .15s ease;
}
.panel-resizer:hover::before,
.panel-resizer.active::before {
  background:var(--accent);
  box-shadow:0 0 0 1px rgba(122,162,247,.16);
}
body.panel-resizing,
body.panel-resizing * {
  cursor:col-resize !important;
  user-select:none !important;
}

/* == Sidebar == */
#sidebar {
  width:220px; min-width:140px; background:var(--bg2);
  display:flex; flex-direction:column; flex-shrink:0; overflow:hidden;
}
#sidebar-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:6px 8px; border-bottom:1px solid var(--border); font-size:11px; color:var(--text-dim);
}
#sidebar-header span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sidebar-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
#file-tree { flex:1; overflow-y:auto; padding:4px 0; font-family:monospace; font-size:12px; }
.tree-item { display:flex; align-items:center; padding:2px 8px; cursor:pointer; gap:4px; white-space:nowrap;
  color:var(--text); transition:background .1s; user-select:none; }
.tree-item:hover { background:var(--bg3); }
.tree-item.active { background:var(--accent); color:var(--bg); }
.tree-icon { width:14px; text-align:center; flex-shrink:0; font-size:11px; }
.tree-name { overflow:hidden; text-overflow:ellipsis; flex:1; }
.tree-dir > .tree-children { display:none; }
.tree-dir.open > .tree-children { display:block; }
.tree-actions { display:flex; align-items:center; gap:4px; margin-left:auto; opacity:0; transition:opacity .12s; }
.tree-item:hover .tree-actions { opacity:1; }
.tree-context-menu { position:fixed; background:var(--bg2); border:1px solid var(--border); border-radius:6px;
  padding:4px 0; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,.3); min-width:160px; }
.tree-context-item { padding:6px 12px; cursor:pointer; font-size:12px; color:var(--text); }
.tree-context-item:hover { background:var(--accent); color:var(--bg); }
.tree-item:hover .tree-actions, .tree-item.active .tree-actions { opacity:1; }
.tree-action-btn {
  width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center;
  border:1px solid transparent; border-radius:4px; background:transparent; color:inherit;
  cursor:pointer; font-size:12px; line-height:1; flex-shrink:0;
}
.tree-action-btn:hover { border-color:var(--red); color:var(--red); background:rgba(247,118,142,.12); }
.tree-item.active .tree-action-btn:hover { background:rgba(26,27,38,.12); color:var(--bg); border-color:var(--bg); }

/* == Editor panel == */
#editor-panel { flex:1; min-width:240px; display:flex; flex-direction:column; overflow:hidden; }
#editor-tabs {
  display:flex; align-items:center; background:var(--bg2); border-bottom:1px solid var(--border);
  overflow-x:auto; flex-shrink:0; min-height:30px;
}
.tab { display:flex; align-items:center; gap:4px; padding:4px 12px; font-size:11px; font-family:monospace;
  color:var(--text-dim); cursor:pointer; border-right:1px solid var(--border); white-space:nowrap; transition:all .1s; }
.tab:hover { background:var(--bg3); color:var(--text); }
.tab.active { background:var(--bg); color:var(--accent); border-bottom:2px solid var(--accent); }
.tab .close-tab { opacity:.5; margin-left:4px; font-size:10px; }
.tab .close-tab:hover { opacity:1; color:var(--red); }
.tab .modified { color:var(--yellow); margin-left:2px; }

#editor-content {
  flex:1; overflow:auto; background:var(--editor-bg); position:relative;
}
#editor-welcome {
  display:flex; align-items:center; justify-content:center; height:100%;
  color:var(--text-dim); font-size:14px; font-family:monospace;
}
/* Code display with line numbers */
#code-view { display:none; width:100%; min-height:100%; }
#preview-view {
  display:none; width:100%; min-height:100%; overflow:hidden;
  background:var(--editor-bg);
}
#preview-view .markdown-preview-wrap { padding:18px 24px 28px; }
#preview-view .markdown-body {
  max-width:980px; margin:0 auto; font-size:14px;
}
.preview-shell {
  display:flex; flex-direction:column; min-height:100%;
}
.preview-toolbar {
  position:sticky; top:0; z-index:3;
  display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
  padding:10px 12px; border-bottom:1px solid var(--border); background:rgba(36,40,59,.96);
  backdrop-filter:blur(8px);
}
[data-theme="light"] .preview-toolbar { background:rgba(255,255,255,.96); }
.preview-toolbar-group { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.preview-toolbar-label {
  font-family:monospace; font-size:11px; color:var(--text-dim);
  white-space:nowrap;
}
.preview-toolbar button {
  background:transparent; color:var(--text-dim); border:1px solid var(--border);
  border-radius:4px; padding:3px 9px; font-size:11px; cursor:pointer; font-family:monospace;
}
.preview-toolbar button:hover { color:var(--text); border-color:var(--accent); }
.preview-toolbar button:disabled { opacity:.4; cursor:not-allowed; }
.preview-pan-shell {
  flex:1; min-height:0; overflow:auto; padding:18px; cursor:grab;
  background:
    linear-gradient(45deg, rgba(127,127,127,.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(127,127,127,.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(127,127,127,.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(127,127,127,.06) 75%);
  background-size:24px 24px;
  background-position:0 0, 0 12px, 12px -12px, -12px 0;
}
.preview-pan-shell.dragging { cursor:grabbing; }
.preview-stage {
  display:flex; align-items:flex-start; justify-content:flex-start;
  min-width:100%; min-height:100%;
}
.preview-stage.centered { justify-content:center; }
.preview-empty {
  display:flex; align-items:center; justify-content:center; width:100%; min-height:320px;
  color:var(--text-dim); font-family:monospace; font-size:13px;
}
.preview-image {
  display:block; max-width:none; max-height:none; box-shadow:0 12px 30px rgba(0,0,0,.24);
  border:1px solid var(--border); border-radius:8px; background:var(--bg2);
}
.preview-pdf-canvas {
  display:block; box-shadow:0 12px 30px rgba(0,0,0,.24);
  border:1px solid var(--border); border-radius:8px; background:#fff;
}
#code-view table { border-collapse:collapse; width:100%; }
#code-view .ln { color:var(--editor-ln); text-align:right; padding:0 12px 0 8px; user-select:none;
  font-family:monospace; font-size:12px; line-height:1.6; vertical-align:top; width:1px; white-space:nowrap; }
#code-view .code-line { padding:0 12px; font-family:monospace; font-size:12px; line-height:1.6;
  white-space:pre; tab-size:4; }
#code-view pre { margin:0; padding:0; background:transparent !important; }
#code-view code { background:transparent !important; padding:0 !important; font-size:12px !important; }

/* Edit mode */
#edit-area { display:none; width:100%; height:100%; position:relative; background:var(--editor-bg); overflow:hidden; }
#edit-highlight, #edit-area textarea {
  position:absolute; inset:0; width:100%; height:100%; margin:0;
  font-family:monospace; font-size:12px; line-height:1.6; padding:8px 12px; tab-size:4;
  white-space:pre; overflow:auto;
}
#edit-highlight {
  pointer-events:none; color:var(--text); background:var(--editor-bg);
}
#edit-highlight code {
  display:block; min-height:100%; background:transparent !important;
  padding:0 !important; font-size:12px !important;
}
#edit-area textarea {
  background:transparent; color:transparent; border:none; outline:none; resize:none; caret-color:var(--text);
  -webkit-text-fill-color:transparent;
}
#edit-area textarea::selection { background:rgba(122,162,247,.26); }

#editor-statusbar {
  display:flex; align-items:center; justify-content:space-between;
  padding:2px 10px; background:var(--bg2); border-top:1px solid var(--border);
  font-size:11px; font-family:monospace; color:var(--text-dim); flex-shrink:0; min-height:22px;
}
.editor-actions { display:flex; gap:6px; }
.editor-actions button {
  background:var(--accent); color:var(--bg); border:none; border-radius:3px;
  padding:1px 8px; font-size:11px; cursor:pointer; font-family:monospace;
}
.editor-actions button:hover { opacity:.85; }
.editor-actions button.secondary { background:transparent; color:var(--text-dim); border:1px solid var(--border); }
.editor-actions button.secondary:hover { color:var(--text); border-color:var(--accent); }

/* == Pending review == */
#review-panel {
  display:none; flex-direction:column; min-height:260px; max-height:50%;
  border-top:1px solid var(--border); background:var(--bg2); flex-shrink:0;
}
#review-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:8px 10px; border-bottom:1px solid var(--border); background:var(--bg);
  font-size:12px; font-family:monospace; color:var(--text);
}
#review-body {
  display:flex; flex-direction:column;
  flex:1; min-height:0; overflow:hidden;
}
#review-list {
  width:100%; min-width:0; max-width:none; border-bottom:1px solid var(--border);
  overflow-x:auto; overflow-y:hidden; background:var(--bg2);
  display:flex; align-items:stretch;
}
.review-item {
  padding:10px 12px; border-right:1px solid var(--border); cursor:pointer;
  transition:background .12s; min-width:220px; max-width:320px; flex:0 0 260px;
}
.review-item:hover { background:var(--bg3); }
.review-item.active { background:var(--bg3); box-shadow:inset 0 3px 0 var(--accent); }
.review-path {
  font-family:monospace; font-size:12px; color:var(--text);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.review-meta {
  display:flex; gap:8px; margin-top:4px; font-family:monospace; font-size:11px; color:var(--text-dim);
}
.review-added { color:var(--green); }
.review-removed { color:var(--red); }
.review-created { color:var(--yellow); }
.review-actions { display:flex; gap:6px; }
.review-actions button, .review-file-actions button {
  background:transparent; color:var(--text-dim); border:1px solid var(--border);
  border-radius:4px; padding:3px 10px; font-size:11px; cursor:pointer; font-family:monospace;
}
.review-actions button:hover, .review-file-actions button:hover { color:var(--text); border-color:var(--accent); }
.review-actions .primary, .review-file-actions .primary {
  background:var(--green); color:var(--bg); border-color:var(--green);
}
.review-actions .danger, .review-file-actions .danger {
  background:transparent; color:var(--red); border-color:var(--red);
}
#review-diff { flex:1; display:flex; flex-direction:column; min-width:0; }
.review-diff-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:10px 12px; border-bottom:1px solid var(--border); background:var(--bg2); gap:10px;
  align-items:flex-start; flex-wrap:wrap;
}
.review-diff-title {
  display:flex; flex-direction:column; gap:4px; min-width:180px; flex:1 1 260px;
}
.review-diff-path {
  font-family:monospace; font-size:12px; color:var(--text);
  white-space:normal; overflow-wrap:anywhere; line-height:1.5;
}
.review-diff-note { font-size:11px; color:var(--text-dim); font-family:monospace; white-space:normal; line-height:1.5; }
.review-file-actions { display:flex; gap:6px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end; }
.review-diff-body { flex:1; overflow:auto; background:var(--editor-bg); }
.review-empty {
  display:flex; align-items:center; justify-content:center; height:100%;
  color:var(--text-dim); font-family:monospace; font-size:13px;
}
.diff-table { width:max-content; min-width:100%; border-collapse:collapse; font-family:monospace; font-size:12px; }
.diff-table col.diff-col-sign { width:32px; }
.diff-table col.diff-col-old, .diff-table col.diff-col-new { width:58px; }
.diff-table td { vertical-align:top; line-height:1.65; border-bottom:1px solid rgba(127,127,127,.12); }
.diff-hunk td {
  padding:6px 10px; color:var(--accent); background:var(--bg2); border-top:1px solid var(--border);
}
.diff-sign, .diff-old, .diff-new {
  width:1px; white-space:nowrap; user-select:none; color:var(--text-dim);
  padding:0 8px; text-align:right; background:rgba(127,127,127,.05);
}
.diff-sign { text-align:center; font-weight:600; }
.diff-content {
  white-space:pre; padding:0 16px 0 10px; color:var(--text);
}
.diff-row.add { background:rgba(158,206,106,.16); box-shadow:inset 3px 0 0 rgba(158,206,106,.55); }
.diff-row.remove { background:rgba(247,118,142,.16); box-shadow:inset 3px 0 0 rgba(247,118,142,.55); }
.diff-row.context { background:transparent; }
.diff-row.context .diff-content { color:var(--text-dim); }
.diff-row.add .diff-sign { color:var(--green); }
.diff-row.remove .diff-sign { color:var(--red); }
.diff-row.add .diff-content, .diff-row.remove .diff-content { color:var(--text); font-weight:500; }

/* == Terminal panel == */
#terminal-panel {
  display:flex; flex-direction:column; min-height:220px; max-height:45%;
  border-top:1px solid var(--border); background:var(--bg2); flex-shrink:0;
}
#terminal-header {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:8px 10px; border-bottom:1px solid var(--border); background:var(--bg);
}
#terminal-tabs {
  display:flex; align-items:center; gap:6px; overflow-x:auto; flex:1; min-width:0;
}
.terminal-tab {
  display:flex; align-items:center; gap:6px; min-width:0;
  padding:5px 10px; border:1px solid var(--border); border-radius:6px;
  background:var(--bg2); color:var(--text-dim); cursor:pointer;
  font-family:monospace; font-size:11px;
}
.terminal-tab:hover { color:var(--text); border-color:var(--accent); }
.terminal-tab.active { color:var(--accent); border-color:var(--accent); background:var(--bg3); }
.terminal-tab-name {
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;
}
.terminal-tab-state { width:7px; height:7px; border-radius:50%; background:var(--text-dim); flex-shrink:0; }
.terminal-tab.running .terminal-tab-state { background:var(--green); }
.terminal-tab.exited .terminal-tab-state { background:var(--red); }
.terminal-tab-close {
  opacity:.65; color:var(--text-dim); font-size:12px; cursor:pointer; flex-shrink:0;
}
.terminal-tab-close:hover { opacity:1; color:var(--red); }
.terminal-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
#terminal-status {
  color:var(--text-dim); font-family:monospace; font-size:11px;
  max-width:360px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
#terminal-body {
  position:relative; flex:1; min-height:0; background:var(--terminal-bg);
}
#subtask-panel {
  display:flex; flex-direction:column; gap:8px;
  padding:8px 10px; border-bottom:1px solid var(--border); background:var(--bg2);
}
#subtask-bar {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  font-family:monospace; font-size:11px; color:var(--text-dim);
}
#subtask-list {
  display:flex; flex-direction:column; gap:6px; max-height:132px; overflow:auto;
}
#subtask-empty {
  display:none; color:var(--text-dim); font-family:monospace; font-size:12px;
}
.subtask-item {
  border:1px solid var(--border); border-radius:8px; padding:8px 10px;
  background:var(--bg); display:flex; flex-direction:column; gap:6px;
}
.subtask-item.running { border-color:rgba(158,206,106,.45); }
.subtask-item.stopping { border-color:rgba(224,175,104,.5); }
.subtask-item.timed-out { border-color:rgba(247,118,142,.52); }
.subtask-head {
  display:flex; align-items:flex-start; justify-content:space-between; gap:8px;
}
.subtask-name {
  font-family:monospace; font-size:12px; color:var(--text); font-weight:600;
  word-break:break-word;
}
.subtask-status {
  flex-shrink:0; font-family:monospace; font-size:10px; color:var(--text-dim);
  border:1px solid var(--border); border-radius:999px; padding:2px 7px; background:var(--bg2);
}
.subtask-meta, .subtask-preview {
  font-family:monospace; font-size:11px; color:var(--text-dim); white-space:pre-wrap;
  word-break:break-word;
}
.subtask-actions { display:flex; justify-content:flex-end; }
.subtask-stop {
  background:transparent; color:var(--text-dim); border:1px solid var(--border); border-radius:5px;
  padding:4px 8px; cursor:pointer; font-family:monospace; font-size:11px;
}
.subtask-stop:hover { color:var(--red); border-color:var(--red); }
#terminal-empty {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  color:var(--text-dim); font-family:monospace; font-size:13px; padding:16px; text-align:center;
}
#terminal-views {
  position:absolute; inset:0;
}
.terminal-view {
  display:none; position:absolute; inset:0; padding:8px; background:var(--terminal-bg);
}
.terminal-view.active { display:block; }
.terminal-host {
  width:100%; height:100%; background:var(--terminal-bg);
  border:1px solid var(--border); border-radius:8px; overflow:hidden;
}
.terminal-host .xterm {
  height:100%; background:var(--terminal-bg);
}
.terminal-host .xterm-screen, .terminal-host .xterm-viewport, .terminal-host .xterm-helpers {
  background:var(--terminal-bg);
}
.terminal-host .xterm-viewport {
  overflow-y:auto !important;
}

/* == Chat panel == */
#chat-panel { width:380px; min-width:240px; display:flex; flex-direction:column; overflow:hidden; background:var(--bg); }

#messages { flex:1; overflow-y:auto; padding:10px 12px; scroll-behavior:smooth; }
.msg { margin-bottom:12px; line-height:1.5; }
.msg .role { font-family:monospace; font-size:11px; font-weight:600; margin-bottom:2px; text-transform:uppercase; }
.msg.user .role { color:var(--accent); }
.msg.assistant .role { color:var(--green); }
.msg.system .role { color:var(--yellow); }
.msg.reasoning .role { color:var(--yellow); }
.msg .body { font-family:monospace; font-size:12px; white-space:pre-wrap; word-break:break-word; line-height:1.6; }
.msg.user .body { background:var(--bg2); border:1px solid var(--border); border-radius:6px; padding:6px 10px; }
.msg.assistant .body.streaming-text { white-space:pre-wrap; word-break:break-word; font-family:inherit; }
.reasoning-box { border:1px solid var(--border); border-radius:8px; background:var(--bg2); overflow:hidden; }
.reasoning-summary {
  cursor:pointer; list-style:none; padding:7px 10px; font-family:monospace; font-size:11px; color:var(--text-dim);
  display:flex; align-items:center; gap:8px; user-select:none;
}
.reasoning-summary::-webkit-details-marker { display:none; }
.reasoning-pre {
  margin:0; padding:0 10px 10px; max-height:220px; overflow:auto; white-space:pre-wrap; word-break:break-word;
  font-family:monospace; font-size:11px; line-height:1.5; color:var(--text-dim);
}
.reasoning-pre.streaming-cursor::after { content:'\\2588'; animation:blink 1s step-end infinite; color:var(--accent); }
.message-image {
  display:inline-block; margin:4px 0; border:1px solid var(--border); border-radius:6px; overflow:hidden;
  background:var(--bg);
}
.message-image img { max-width:100%; max-height:300px; display:block; }
.message-image .image-label {
  display:block; font-size:11px; color:var(--text-dim); padding:2px 6px; text-align:center;
  background:var(--bg2);
}
.msg.assistant .body { padding:2px 0; }
.markdown-body { font-family:inherit; font-size:13px; white-space:normal; line-height:1.65; word-break:normal; }
.markdown-body > *:first-child { margin-top:0; }
.markdown-body > *:last-child { margin-bottom:0; }
.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin:14px 0 8px; line-height:1.35; font-weight:700;
}
.markdown-body h1 { font-size:20px; }
.markdown-body h2 { font-size:18px; }
.markdown-body h3 { font-size:16px; }
.markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body blockquote, .markdown-body hr, .markdown-body .markdown-code-block {
  margin:0 0 10px;
}
.markdown-body ul, .markdown-body ol { padding-left:22px; }
.markdown-body li + li { margin-top:4px; }
.markdown-body a { color:var(--accent); text-decoration:none; }
.markdown-body a:hover { text-decoration:underline; }
.markdown-body code {
  display:inline-block; font-family:monospace; font-size:.92em;
  background:var(--bg2); border:1px solid var(--border); border-radius:4px; padding:0 4px;
}
.markdown-body .markdown-code-block {
  border:1px solid var(--border); border-radius:8px; overflow:hidden; background:var(--editor-bg);
}
.markdown-body .markdown-code-toolbar {
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  padding:7px 10px; background:var(--bg2); border-bottom:1px solid var(--border);
  font-family:monospace; font-size:11px; color:var(--text-dim);
}
.markdown-body .markdown-code-lang {
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-transform:lowercase;
}
.markdown-body .copy-code-btn {
  background:transparent; color:var(--text-dim); border:1px solid var(--border);
  border-radius:4px; padding:2px 8px; font-family:monospace; font-size:11px; cursor:pointer;
  transition:all .12s;
}
.markdown-body .copy-code-btn:hover {
  color:var(--text); border-color:var(--accent);
}
.markdown-body .copy-code-btn.copied {
  color:var(--green); border-color:var(--green); background:rgba(158,206,106,.12);
}
.markdown-body pre {
  background:var(--editor-bg); border:1px solid var(--border);
  border-radius:8px; padding:10px 12px; overflow:auto;
}
.markdown-body .markdown-code-block pre {
  margin:0; border:none; border-radius:0; padding:10px 12px; background:transparent;
}
.markdown-body pre code {
  display:block; background:transparent; border:none; border-radius:0;
  padding:0; font-size:12px; white-space:pre;
}
.markdown-body blockquote {
  border-left:3px solid var(--accent); padding-left:12px; color:var(--text-dim);
}
.markdown-body hr { border:none; border-top:1px solid var(--border); }
.markdown-body .markdown-table-wrap {
  margin:0 0 12px; overflow-x:auto; border:1px solid var(--border); border-radius:8px;
}
.markdown-body table {
  width:100%; min-width:100%; border-collapse:collapse; font-size:13px; line-height:1.55;
}
.markdown-body th, .markdown-body td {
  border-bottom:1px solid var(--border); padding:8px 10px; text-align:left; vertical-align:top;
}
.markdown-body thead th {
  background:var(--bg2); font-weight:700;
}
.markdown-body tbody tr:nth-child(even) td {
  background:rgba(127,127,127,.05);
}
.markdown-body tbody tr:last-child td, .markdown-body thead tr:last-child th {
  border-bottom:none;
}

.tool-call { background:var(--bg2); border:1px solid var(--border); border-radius:4px; padding:4px 8px; margin:6px 0; font-family:monospace; font-size:11px; }
.tool-call .tool-name { color:var(--yellow); font-weight:600; }
.tool-call .tool-args { color:var(--text-dim); margin-left:4px; }
.tool-call .tool-result { margin-top:4px; padding-top:4px; border-top:1px solid var(--border); color:var(--text-dim); max-height:80px; overflow-y:auto; white-space:pre-wrap; }
.tool-call .tool-result.success { border-left:2px solid var(--green); padding-left:6px; }
.tool-call .tool-result.failure { border-left:2px solid var(--red); padding-left:6px; }

.streaming-cursor::after { content:'\\2588'; animation:blink 1s step-end infinite; color:var(--accent); }
@keyframes blink { 50% { opacity:0; } }

.usage-bar { font-family:monospace; font-size:10px; color:var(--text-dim); text-align:right; padding:2px 0; }

/* chat input */
#chat-input-area { border-top:1px solid var(--border); padding:8px 10px; display:flex; flex-direction:column; gap:6px; background:var(--bg2); flex-shrink:0; position:relative; }
#chat-input-row { display:flex; gap:6px; align-items:flex-end; }
#chat-input-area textarea { flex:1; background:var(--bg); color:var(--text); border:1px solid var(--border); border-radius:6px;
  padding:6px 10px; font-family:inherit; font-size:13px; resize:none; outline:none; min-height:36px; max-height:160px; line-height:1.4; }
#chat-input-area textarea:focus { border-color:var(--accent); }
#chat-input-area textarea::placeholder { color:var(--text-dim); }
#chat-input-area button { background:var(--accent); color:var(--bg); border:none; border-radius:6px;
  padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; height:36px; flex-shrink:0; }
#chat-input-area button:disabled { opacity:.4; cursor:not-allowed; }
#cancel-btn {
  display:none; background:transparent !important; color:var(--text-dim) !important;
  border:1px solid var(--border) !important;
}
#cancel-btn:hover { color:var(--text) !important; border-color:var(--red) !important; }
#chat-input-row #upload-img-btn { background:transparent !important; padding:6px !important; font-size:20px !important; }
#chat-input-row #upload-img-btn:hover { background:var(--border) !important; }
#chat-images-container { display:flex; gap:8px; flex-wrap:wrap; min-height:0; }
#chat-images-status {
  min-height:16px; font-size:11px; color:var(--text-dim);
  font-family:monospace;
}
#chat-images-status.warn { color:var(--yellow); }
.chat-image-preview {
  position:relative; display:inline-block; border:1px solid var(--border); border-radius:6px; overflow:hidden;
  background:var(--bg);
}
.chat-image-preview img { display:block; max-height:80px; max-width:120px; object-fit:cover; }
.chat-image-preview .remove-img {
  position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,.6);
  color:#fff; border:none; font-size:14px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;
}
.chat-image-preview .remove-img:hover { background:var(--red); }
#chat-context-files { display:none; gap:6px; flex-wrap:wrap; }
.context-chip {
  display:inline-flex; align-items:center; gap:6px; max-width:100%;
  background:var(--bg); border:1px solid var(--border); border-radius:999px;
  padding:3px 10px; color:var(--text); font-family:monospace; font-size:11px;
}
.context-chip .chip-label {
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:240px;
}
.context-chip button {
  height:auto !important; padding:0 !important; background:transparent !important; color:var(--text-dim) !important;
  border:none; font-size:12px; line-height:1; cursor:pointer;
}
.context-chip button:hover { color:var(--red) !important; }
#mention-menu {
  position:absolute; left:10px; right:10px; bottom:52px;
  display:none; flex-direction:column; max-height:220px; overflow-y:auto;
  background:var(--bg); border:1px solid var(--border); border-radius:8px;
  box-shadow:0 8px 24px rgba(0,0,0,.22); z-index:30;
}
.mention-item {
  display:flex; flex-direction:column; gap:2px; padding:8px 10px; cursor:pointer;
  border-bottom:1px solid var(--border); transition:background .12s;
}
.mention-item:last-child { border-bottom:none; }
.mention-item:hover, .mention-item.active { background:var(--bg3); }
.mention-name { font-family:monospace; font-size:12px; color:var(--text); }
.mention-path { font-family:monospace; font-size:11px; color:var(--text-dim); }

#cmd-bar { display:flex; gap:4px; padding:4px 10px; background:var(--bg2); border-top:1px solid var(--border); flex-shrink:0; flex-wrap:wrap; }
#cmd-bar button { background:transparent; color:var(--text-dim); border:1px solid var(--border); border-radius:3px;
  padding:1px 6px; font-family:monospace; font-size:10px; cursor:pointer; }
#cmd-bar button:hover { color:var(--text); border-color:var(--accent); }

#permission-mode-bar { display:flex; align-items:center; gap:4px; padding:4px 10px; background:var(--bg2); border-top:1px solid var(--border); flex-shrink:0; }
.pm-label { font-size:11px; color:var(--text-dim); font-family:monospace; }
.pm-btn { background:transparent; color:var(--text-dim); border:1px solid var(--border); border-radius:3px;
  padding:1px 8px; font-family:monospace; font-size:11px; cursor:pointer; transition:all .15s; }
.pm-btn:hover { color:var(--text); border-color:var(--accent); }
.pm-btn.active { color:var(--green); border-color:var(--green); background:rgba(158,206,106,.08); }

/* ---- Settings Modal ---- */
#settings-overlay {
  position:fixed; top:0; left:0; width:100%; height:100%;
  background:rgba(0,0,0,.5); z-index:1000;
  display:flex; align-items:center; justify-content:center;
}
#settings-modal {
  background:var(--bg2); border:1px solid var(--border); border-radius:10px;
  width:520px; max-height:80vh; display:flex; flex-direction:column; overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,.4);
}
.modal-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 16px; border-bottom:1px solid var(--border);
}
.modal-title { font-size:15px; font-weight:600; }
.modal-body { flex:1; overflow-y:auto; padding:16px; }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:12px 16px; border-top:1px solid var(--border); }

.settings-section { margin-bottom:14px; }
.settings-label { display:block; font-size:12px; font-weight:600; color:var(--text-dim); margin-bottom:4px; font-family:monospace; }
.settings-label.settings-path { font-size:11px; color:var(--text-dim); word-break:break-all; font-weight:400; }
.settings-input {
  width:100%; background:var(--bg); color:var(--text); border:1px solid var(--border);
  border-radius:6px; padding:6px 10px; font-size:13px; font-family:monospace; outline:none;
}
.settings-input.textarea { min-height:78px; resize:vertical; line-height:1.45; }
.settings-input:focus { border-color:var(--accent); }
select.settings-input { appearance:auto; cursor:pointer; }
.settings-row { display:flex; gap:6px; align-items:center; }
.settings-row .settings-input { flex:1; }
.settings-history-select { flex:0 0 220px !important; max-width:220px; }
.settings-check { display:flex; align-items:center; gap:8px; font-family:monospace; font-size:12px; color:var(--text); }
.settings-check input { width:14px; height:14px; }
.settings-hint { font-size:11px; margin-top:4px; font-family:monospace; min-height:16px; }
.settings-hint.ok { color:var(--green); }
.settings-hint.err { color:var(--red); }
.settings-link {
  display:inline-flex; align-items:center; gap:6px; margin-top:6px;
  font-size:11px; font-family:monospace; color:var(--text-dim); text-decoration:none;
}
.settings-link:hover { color:var(--accent); }
.settings-divider { border-top:1px solid var(--border); margin:14px 0; }

.settings-btn {
  background:var(--accent); color:var(--bg); border:none; border-radius:5px;
  padding:5px 14px; font-size:12px; cursor:pointer; font-family:monospace; white-space:nowrap;
}
.settings-btn:hover { opacity:.85; }
.settings-btn.secondary { background:transparent; color:var(--text-dim); border:1px solid var(--border); }
.settings-btn.secondary:hover { color:var(--text); border-color:var(--accent); }
.settings-btn.primary { background:var(--green); font-weight:600; }

/* scrollbar */
::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:var(--scrollbar); border-radius:3px; }
</style>
</head>
<body>
<div id="app">
  <!-- ============ Header ============ -->
  <div id="header" ondblclick="toggleMaximize()">
    <div class="hdr-left">
      <div class="logo">zen-cli<small>v0.5</small></div>
      <div id="provider-bar"></div>
      <span class="model-lbl" id="model-label">—</span>
    </div>
    <div class="hdr-right">
      <button class="icon-btn" id="minimize-btn" onclick="minimizeWindow()" data-i18n-title="ui.minimize" title="Minimize">&#x2013;</button>
      <button class="icon-btn" id="maximize-btn" onclick="toggleMaximize()" data-i18n-title="ui.maximize" title="Maximize">&#x25A1;</button>
      <button class="icon-btn" id="close-btn" onclick="closeWindow()" data-i18n-title="ui.close" title="Close">&#x2715;</button>
      <button class="icon-btn" id="refresh-providers-btn" data-i18n-title="ui.refreshProviders" title="Refresh providers">&#x21bb;</button>
      <button class="icon-btn" id="theme-btn" onclick="toggleTheme()" data-i18n-title="ui.toggleTheme" title="Toggle theme">&#9790;</button>
      <button class="icon-btn" id="lang-btn" onclick="toggleLang()">EN</button>
      <button class="icon-btn" id="settings-btn" data-i18n-title="ui.settings" title="Settings">&#9881;</button>
      <span class="model-lbl" id="status">...</span>
    </div>
  </div>

  <!-- ============ Main 3-Panel ============ -->
  <div id="main">
    <!-- Sidebar -->
    <div id="sidebar">
      <div id="sidebar-header">
        <span id="folder-label" title="">No folder</span>
      <div class="sidebar-actions">
        <button class="icon-btn" onclick="loadFileTree('.')" data-i18n-title="sidebar.refreshTree" title="Refresh file tree">&#x21bb;</button>
        <button class="icon-btn" onclick="createFolderInCurrentDir()" data-i18n-title="sidebar.newFolderHere" title="New folder here">+</button>
        <button class="icon-btn" onclick="openFolderDialog()" data-i18n-title="sidebar.openFolder" title="Open folder">&#128193;</button>
      </div>
      </div>
      <div id="file-tree"></div>
      <div id="tree-context-menu" class="tree-context-menu" style="display:none">
        <div class="tree-context-item" onclick="openTreeItemAsRoot()">Open as project root</div>
        <div class="tree-context-item" onclick="createFolderInTreeItem()">New folder here</div>
      </div>
    </div>
    <div id="sidebar-resizer" class="panel-resizer" role="separator" aria-orientation="vertical" tabindex="-1"></div>

    <!-- Editor -->
    <div id="editor-panel">
      <div id="editor-tabs"></div>
      <div id="editor-content">
        <div id="editor-welcome"><span data-i18n="editor.welcome">Open a file from the sidebar</span></div>
        <div id="code-view"></div>
        <div id="preview-view"></div>
        <div id="edit-area">
          <pre id="edit-highlight" aria-hidden="true"></pre>
          <textarea id="edit-textarea" spellcheck="false"></textarea>
        </div>
      </div>
      <div id="editor-statusbar">
        <span id="editor-info">—</span>
        <div class="editor-actions" id="editor-actions" style="display:none">
          <button class="secondary" onclick="toggleEditMode()" id="edit-toggle-btn" data-i18n="editor.edit">Edit</button>
          <button class="secondary" onclick="runActivePythonFile()" id="run-file-btn" style="display:none" data-i18n="editor.run">Run</button>
          <button onclick="saveFile()" id="save-btn" style="display:none" data-i18n="editor.save">Save</button>
        </div>
      </div>
      <div id="review-panel">
        <div id="review-header">
          <span id="review-title" data-i18n="review.title">Pending Changes</span>
          <div class="review-actions">
            <button class="primary" onclick="acceptAllPendingChanges()" data-i18n="review.acceptAll">Accept All</button>
            <button class="danger" onclick="rejectAllPendingChanges()" data-i18n="review.rejectAll">Reject All</button>
          </div>
        </div>
        <div id="review-body">
          <div id="review-list"></div>
          <div id="review-diff">
            <div class="review-empty" id="review-empty" data-i18n="review.empty">No pending changes</div>
          </div>
        </div>
      </div>
      <div id="terminal-panel">
        <div id="terminal-header">
          <div id="terminal-tabs"></div>
          <div class="terminal-actions">
            <span id="terminal-status" data-i18n="terminal.ready">Terminal ready</span>
            <button class="icon-btn" onclick="createTerminalSession()" id="new-terminal-btn" data-i18n-title="terminal.new" title="New terminal">+</button>
          </div>
        </div>
        <div id="subtask-panel">
          <div id="subtask-bar">
            <span id="subtask-title" data-i18n="subtask.title">Background subtasks</span>
            <span id="subtask-count">0</span>
          </div>
          <div id="subtask-empty" data-i18n="subtask.empty">No background subtasks</div>
          <div id="subtask-list"></div>
        </div>
        <div id="terminal-body">
          <div id="terminal-empty" data-i18n="terminal.empty">Open a terminal or run a Python file</div>
          <div id="terminal-views"></div>
        </div>
      </div>
    </div>
    <div id="chat-resizer" class="panel-resizer" role="separator" aria-orientation="vertical" tabindex="-1"></div>

    <!-- Chat -->
    <div id="chat-panel">
      <div id="messages"></div>
      <div id="chat-input-area">
        <div id="chat-context-files"></div>
        <div id="chat-images-container"></div>
        <div id="chat-images-status"></div>
        <div id="mention-menu"></div>
        <div id="chat-input-row">
          <button id="upload-img-btn" class="icon-btn" onclick="triggerImageUpload()" data-i18n-title="chat.uploadImage" title="Upload images">📷</button>
          <input type="file" id="image-upload-input" accept="image/*" multiple style="display:none" onchange="handleImageUpload(event)" />
          <textarea id="chat-input" rows="1" placeholder="" data-i18n-placeholder="chat.placeholder" autofocus></textarea>
          <button id="cancel-btn" onclick="cancelCurrentRequest()" data-i18n="chat.cancel">Cancel turn</button>
          <button id="send-btn" onclick="sendMessage()" data-i18n="chat.send">Send</button>
        </div>
      </div>
      <div id="cmd-bar">
        <button onclick="startNewConversation()" data-i18n="chat.newConversation">New conversation</button>
        <button onclick="sendCommand('/clear')">/clear</button>
        <button onclick="sendCommand('/compact')">/compact</button>
        <button onclick="sendCommand('/usage')">/usage</button>
      </div>
      <div id="permission-mode-bar">
        <span class="pm-label" data-i18n="chat.permissionMode">Mode:</span>
        <button class="pm-btn active" data-mode="default" onclick="setPermissionMode('default')" data-i18n="perm.default">default</button>
        <button class="pm-btn" data-mode="auto" onclick="setPermissionMode('auto')" data-i18n="perm.auto">auto</button>
        <button class="pm-btn" data-mode="plan" onclick="setPermissionMode('plan')" data-i18n="perm.plan">plan</button>
      </div>
    </div>
  </div>
</div>

<!-- ============ Settings Modal ============ -->
<div id="settings-overlay" style="display:none" onclick="if(event.target===this)closeSettings()">
  <div id="settings-modal">
    <div class="modal-header">
      <span class="modal-title" data-i18n="settings.title">Settings</span>
      <button class="icon-btn" onclick="closeSettings()">&times;</button>
    </div>
    <div class="modal-body">
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.zenApiKey">ZenMux API Key</label>
        <div class="settings-row">
          <input type="password" id="s-apikey" class="settings-input" placeholder="sk-..." />
          <button class="settings-btn secondary" onclick="toggleKeyVisibility()">&#128065;</button>
          <button class="settings-btn" onclick="testZenMux()" data-i18n="settings.test">Test</button>
        </div>
        <a class="settings-link" href="https://zenmux.ai/invite/GBQMC5" target="_blank" rel="noreferrer" data-i18n="settings.zenInvite">没有 API Key？使用推荐链接注册 ZenMux</a>
        <div class="settings-hint" id="s-apikey-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.zenBaseUrl">ZenMux Base URL</label>
        <input type="text" id="s-baseurl" class="settings-input" value="https://zenmux.ai/api/v1" />
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.zenModel">ZenMux Model</label>
        <div class="settings-row">
          <input type="text" id="s-model" class="settings-input" value="anthropic/claude-sonnet-4.6" />
          <select id="s-zen-model-select" class="settings-input settings-history-select" onchange="useSavedModel('zenmux')"></select>
        </div>
        <div class="settings-hint" id="s-zen-models-hint" data-i18n="settings.customModelHint">可直接输入自定义模型名，测试成功后会自动保存到列表。</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.ollamaUrl">Ollama Base URL</label>
        <div class="settings-row">
          <input type="text" id="s-ollama-url" class="settings-input" value="http://127.0.0.1:11434/v1" />
          <button class="settings-btn" onclick="testOllama()" data-i18n="settings.test">Test</button>
        </div>
        <div class="settings-hint" id="s-ollama-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.ollamaModel">Ollama Model</label>
        <div class="settings-row">
          <select id="s-ollama-model" class="settings-input" style="flex:1"></select>
          <button class="settings-btn secondary" onclick="refreshOllamaModels()" data-i18n-title="settings.refresh" title="Refresh">&#x21bb;</button>
        </div>
        <div id="s-ollama-models-info" class="settings-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.ollamaPull">Download Model</label>
        <div class="settings-row">
          <input type="text" id="s-ollama-pull-name" class="settings-input" placeholder="e.g. qwen3-coder-next" />
          <button class="settings-btn" onclick="pullOllamaModel()" data-i18n="settings.download">Pull</button>
        </div>
        <div id="s-ollama-pull-progress" class="settings-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.ollamaReasoning">Ollama Reasoning</label>
        <label class="settings-check">
          <input type="checkbox" id="s-ollama-show-reasoning" />
          <span data-i18n="settings.ollamaReasoningToggle">Show raw local reasoning stream</span>
        </label>
        <div class="settings-hint" data-i18n="settings.ollamaReasoningHint">默认只显示“正在思考”状态。开启后会额外显示 Ollama 返回的原始 reasoning 文本，适合调试，不建议普通使用时常开。</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.nvidiaApiKey">NVIDIA API Key</label>
        <div class="settings-row">
          <input type="password" id="s-nvidia-apikey" class="settings-input" placeholder="nvapi-..." />
          <button class="settings-btn secondary" onclick="toggleNvidiaKeyVisibility()" data-i18n-title="settings.toggleVisibility" title="Toggle visibility">&#128065;</button>
          <button class="settings-btn" onclick="testNvidia()" data-i18n="settings.test">Test</button>
        </div>
        <a class="settings-link" href="https://build.nvidia.com/explore/discover" target="_blank" rel="noreferrer" data-i18n="settings.getNvidiaKey">Get NVIDIA API Key</a>
        <div class="settings-hint" id="s-nvidia-apikey-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.nvidiaBaseUrl">NVIDIA Base URL</label>
        <input type="text" id="s-nvidia-baseurl" class="settings-input" value="https://integrate.api.nvidia.com/v1" />
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.nvidiaModel">NVIDIA Model</label>
        <div class="settings-row">
          <input type="text" id="s-nvidia-model" class="settings-input" value="qwen/qwen3.5-122b-a10b" />
          <select id="s-nvidia-model-select" class="settings-input settings-history-select" onchange="useSavedModel('nvidia')"></select>
        </div>
        <div class="settings-hint" id="s-nvidia-models-hint" data-i18n="settings.customModelHint">可直接输入自定义模型名，测试成功后会自动保存到列表。</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.openrouterApiKey">OpenRouter API Key</label>
        <div class="settings-row">
          <input type="password" id="s-openrouter-apikey" class="settings-input" placeholder="sk-or-..." />
          <button class="settings-btn secondary" onclick="toggleOpenRouterKeyVisibility()" data-i18n-title="settings.toggleVisibility" title="Toggle visibility">&#128065;</button>
          <button class="settings-btn" onclick="testOpenRouter()" data-i18n="settings.test">Test</button>
        </div>
        <a class="settings-link" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" data-i18n="settings.getOpenRouterKey">Get OpenRouter API Key</a>
        <div class="settings-hint" id="s-openrouter-apikey-hint"></div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.openrouterBaseUrl">OpenRouter Base URL</label>
        <input type="text" id="s-openrouter-baseurl" class="settings-input" value="https://openrouter.ai/api/v1" />
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.openrouterModel">OpenRouter Model</label>
        <div class="settings-row">
          <input type="text" id="s-openrouter-model" class="settings-input" value="qwen/qwen3.6-plus:free" />
          <select id="s-openrouter-model-select" class="settings-input settings-history-select" onchange="useSavedModel('openrouter')"></select>
        </div>
        <div class="settings-hint" id="s-openrouter-models-hint" data-i18n="settings.customModelHint">可直接输入自定义模型名，测试成功后会自动保存到列表。</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.openrouterSiteUrl">OpenRouter Site URL (Optional)</label>
        <input type="text" id="s-openrouter-siteurl" class="settings-input" placeholder="https://your-site.com" />
        <div class="settings-hint" data-i18n="settings.openrouterSiteUrlHint">Used for rankings on openrouter.ai</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.openrouterSiteName">OpenRouter Site Name (Optional)</label>
        <input type="text" id="s-openrouter-sitename" class="settings-input" placeholder="Your App Name" />
        <div class="settings-hint" data-i18n="settings.openrouterSiteNameHint">Used for rankings on openrouter.ai</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.permissionMode">Permission Mode</label>
        <select id="s-permission-mode" class="settings-input">
          <option value="default">default</option>
          <option value="auto">auto</option>
          <option value="plan">plan</option>
        </select>
        <div class="settings-hint" data-i18n="settings.permissionModeHint">default 允许读操作与可审阅改动；auto 放开限制；plan 只允许规划与只读操作。</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.pathRules">Path Rules</label>
        <textarea id="s-path-rules" class="settings-input textarea" placeholder="deny /etc/**&#10;deny ../**"></textarea>
        <div class="settings-hint" data-i18n="settings.pathRulesHint">每行一条，格式为 allow/deny + 空格 + glob 模式。</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.deniedCommands">Denied Commands</label>
        <textarea id="s-denied-commands" class="settings-input textarea" placeholder="rm -rf /&#10;git push --force*"></textarea>
        <div class="settings-hint" data-i18n="settings.deniedCommandsHint">每行一条 shell 模式，命中后直接拒绝执行。</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.maxIterations">Max Iterations Per Turn</label>
        <input type="number" id="s-max-iterations" class="settings-input" min="1" step="1" value="100" />
        <div class="settings-hint" data-i18n="settings.maxIterationsHint">单轮对话最多允许模型调用工具与继续思考的次数，默认 100。</div>
      </div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.subtaskTimeout">Background Subtask Timeout (seconds)</label>
        <input type="number" id="s-subtask-timeout" class="settings-input" min="1" step="1" value="3600" />
        <div class="settings-hint" data-i18n="settings.subtaskTimeoutHint">后台子任务默认运行时长，超时后会自动停止。</div>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label" data-i18n="settings.memoryBundle">Memory Bundle</label>
        <div class="settings-row">
          <button class="settings-btn secondary" onclick="exportMemoryBundle()" data-i18n="settings.exportMemory">Export</button>
          <button class="settings-btn secondary" onclick="triggerMemoryBundleImport()" data-i18n="settings.importMemory">Import</button>
          <button class="settings-btn secondary" onclick="resetMemoryBundle()" data-i18n="settings.resetMemory">Reset</button>
        </div>
        <div class="settings-hint" id="s-memory-bundle-hint" data-i18n="settings.memoryBundleHint">导出/导入/重置 AGENTS.md、CLAUDE.md、MEMORY.md 与自动踩坑记忆。</div>
        <input type="file" id="memory-bundle-input" accept="application/json,.json" style="display:none" onchange="handleMemoryBundleImport(event)" />
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section">
        <label class="settings-label settings-path" id="s-config-path"></label>
        <div class="settings-hint" id="s-harness-paths"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="settings-btn secondary" onclick="closeSettings()" data-i18n="settings.cancel">Cancel</button>
      <button class="settings-btn primary" onclick="saveSettings()" data-i18n="settings.save">Save</button>
    </div>
  </div>
</div>

<script>
// ==================== i18n ====================
const LANG = {
  'zh-CN': {
    'ui.refreshProviders': '刷新供应商',
    'ui.toggleTheme': '切换主题',
    'ui.settings': '设置',
    'ui.minimize': '最小化',
    'ui.maximize': '最大化',
    'ui.close': '关闭',
    'chat.placeholder': '输入消息... (/help 查看命令, Enter 发送, Shift+Enter 换行)',
    'chat.resumeHint': '检测到此工作区有已保存会话，输入 /resume 可恢复。',
    'chat.newConversation': '新建对话',
    'chat.send': '发送',
    'chat.cancel': '取消本次会话',
    'chat.newConversationConfirm': '当前回复仍在进行中，是否取消并开始新对话？',
    'chat.newConversationPending': '当前会话仍在结束中，请稍后再试。',
    'chat.uploadImage': '上传图片',
    'chat.contextAttached': '已附加文件',
    'chat.noMatches': '没有匹配文件',
    'chat.permissionMode': '模式:',
    'perm.default': '缺省',
    'perm.auto': '自动',
    'perm.plan': '计划',
    'chat.copyCode': '复制',
    'chat.copied': '已复制',
    'editor.welcome': '从左侧打开文件',
    'editor.edit': '编辑',
    'editor.viewing': '查看',
    'editor.preview': '预览',
    'editor.save': '保存',
    'editor.cancel': '取消',
    'editor.run': '运行',
    'review.title': '待审改动',
    'review.empty': '暂无待审改动',
    'review.accept': '接受',
    'review.reject': '拒绝',
    'review.acceptAll': '全部接受',
    'review.rejectAll': '全部拒绝',
    'review.newFile': '新文件',
    'review.waiting': '等待用户确认后写入磁盘',
    'review.accepted': '已接受改动',
    'review.rejected': '已拒绝改动',
    'sidebar.noFolder': '未打开文件夹',
    'sidebar.openFolder': '打开文件夹',
    'sidebar.newFolder': '新建文件夹',
    'sidebar.refreshTree': '刷新文件树',
    'sidebar.openInFinder': '在访达中打开',
    'sidebar.delete': '删除',
    'sidebar.deletedFile': '已删除文件',
    'sidebar.deletedFolder': '已删除文件夹',
    'sidebar.trashedFile': '已移到废纸篓',
    'sidebar.trashedFolder': '已移到废纸篓',
    'settings.title': '设置',
    'settings.zenApiKey': 'ZenMux API 密钥',
    'settings.zenInvite': '没有 API Key？使用推荐链接注册 ZenMux',
    'settings.zenBaseUrl': 'ZenMux 接口地址',
    'settings.zenModel': 'ZenMux 模型',
    'settings.ollamaUrl': 'Ollama 接口地址',
    'settings.ollamaModel': 'Ollama 模型 (已下载)',
    'settings.ollamaPull': '下载模型',
    'settings.ollamaReasoning': 'Ollama 推理展示',
    'settings.ollamaReasoningToggle': '显示本地原始 reasoning 流',
    'settings.ollamaReasoningHint': '默认只显示“正在思考”状态。开启后会额外显示 Ollama 返回的原始 reasoning 文本，适合调试，不建议普通使用时常开。',
    'settings.download': '下载',
    'settings.pulling': '下载中...',
    'settings.pullDone': '下载完成',
    'settings.noModels': '暂无本地模型',
    'settings.modelCount': '个模型',
    'settings.enterModelName': '请输入模型名称',
    'settings.customModelHint': '可直接输入自定义模型名，测试成功后会自动保存到列表。',
    'settings.openrouterApiKey': 'OpenRouter API Key',
    'settings.getOpenRouterKey': '获取 OpenRouter API Key',
    'settings.openrouterBaseUrl': 'OpenRouter Base URL',
    'settings.openrouterModel': 'OpenRouter 模型',
    'settings.openrouterSiteUrl': 'OpenRouter 站点 URL（可选）',
    'settings.openrouterSiteUrlHint': '用于 openrouter.ai 排名',
    'settings.openrouterSiteName': 'OpenRouter 站点名称（可选）',
    'settings.openrouterSiteNameHint': '用于 openrouter.ai 排名',
    'settings.toggleVisibility': '切换可见性',
    'settings.nvidiaApiKey': 'NVIDIA API Key',
    'settings.getNvidiaKey': '获取 NVIDIA API Key',
    'settings.nvidiaBaseUrl': 'NVIDIA Base URL',
    'settings.nvidiaModel': 'NVIDIA 模型',
    'settings.savedModelsSelect': '已保存模型',
    'settings.permissionMode': '权限模式',
    'settings.permissionModeHint': 'default 允许读操作与可审阅改动；auto 放开限制；plan 只允许规划与只读操作。',
    'settings.pathRules': '路径规则',
    'settings.pathRulesHint': '每行一条，格式为 allow/deny + 空格 + glob 模式。',
    'settings.deniedCommands': '拒绝命令',
    'settings.deniedCommandsHint': '每行一条 shell 模式，命中后直接拒绝执行。',
    'settings.maxIterations': '单轮最大迭代次数',
    'settings.maxIterationsHint': '单轮对话最多允许模型调用工具与继续思考的次数，默认 100。',
    'settings.subtaskTimeout': '后台子任务时长（秒）',
    'settings.subtaskTimeoutHint': '后台子任务默认运行时长，超时后会自动停止。',
    'settings.memoryBundle': '记忆打包',
    'settings.memoryBundleHint': '导出/导入/重置 AGENTS.md、CLAUDE.md、MEMORY.md 与自动踩坑记忆。',
    'settings.exportMemory': '导出',
    'settings.importMemory': '导入',
    'settings.resetMemory': '重置',
    'settings.memoryExported': '记忆包已导出',
    'settings.memoryImported': '记忆包已导入并暂存待审',
    'settings.memoryReset': '记忆已重置并暂存待审',
    'settings.memoryImportFail': '记忆包导入失败',
    'settings.memoryResetConfirm': '确认重置永久记忆与自动踩坑记忆吗？这会生成待审改动。',
    'settings.refresh': '刷新',
    'settings.test': '测试',
    'settings.save': '保存',
    'settings.cancel': '取消',
    'settings.saved': '设置已保存',
    'settings.testOk': '连接成功',
    'settings.testSaved': '连接成功，已自动保存',
    'settings.testFail': '连接失败',
    'chat.ollamaReasoning': '本地推理流（Ollama）',
    'chat.ollamaReasoningDone': '本地推理流（已完成）',
    'terminal.ready': '终端就绪',
    'terminal.empty': '新建终端或直接运行 Python 文件',
    'terminal.new': '新建终端',
    'terminal.shell': '终端',
    'terminal.running': '运行中',
    'terminal.exited': '已退出',
    'terminal.python': 'Python 解释器',
    'terminal.runningFile': '正在运行',
    'subtask.title': '后台子任务',
    'subtask.empty': '暂无后台子任务',
    'subtask.running': '运行中',
    'subtask.stopping': '停止中',
    'subtask.exited': '已退出',
    'subtask.timedOut': '已超时',
    'subtask.stop': '停止',
    'subtask.timeout': '超时',
    'preview.image': '图片预览',
    'preview.pdf': 'PDF 预览',
    'preview.loading': '正在加载预览...',
    'preview.zoom': '缩放',
    'preview.resetZoom': '重置缩放',
    'preview.prevPage': '上一页',
    'preview.nextPage': '下一页',
    'preview.page': '页',
    'preview.dragHint': '可拖拽平移，滚轮或按钮缩放',
    'preview.unsupported': '当前文件格式不支持预览',
  },
  'en-US': {
    'ui.refreshProviders': 'Refresh providers',
    'ui.toggleTheme': 'Toggle theme',
    'ui.settings': 'Settings',
    'ui.minimize': 'Minimize',
    'ui.maximize': 'Maximize',
    'ui.close': 'Close',
    'chat.placeholder': 'Type message... (/help for commands, Enter to send, Shift+Enter for new line)',
    'chat.resumeHint': 'A saved session is available for this workspace. Type /resume to restore it.',
    'chat.newConversation': 'New conversation',
    'chat.send': 'Send',
    'chat.cancel': 'Cancel turn',
    'chat.newConversationConfirm': 'A response is still in progress. Cancel it and start a new conversation?',
    'chat.newConversationPending': 'The current turn is still stopping. Please try again in a moment.',
    'chat.uploadImage': 'Upload images',
    'chat.contextAttached': 'Attached files',
    'chat.noMatches': 'No matching files',
    'chat.permissionMode': 'Mode:',
    'perm.default': 'default',
    'perm.auto': 'auto',
    'perm.plan': 'plan',
    'chat.copyCode': 'Copy',
    'chat.copied': 'Copied',
    'editor.welcome': 'Open a file from the sidebar',
    'editor.edit': 'Edit',
    'editor.viewing': 'Viewing',
    'editor.preview': 'Preview',
    'editor.save': 'Save',
    'editor.cancel': 'Cancel',
    'editor.run': 'Run',
    'review.title': 'Pending Changes',
    'review.empty': 'No pending changes',
    'review.accept': 'Accept',
    'review.reject': 'Reject',
    'review.acceptAll': 'Accept All',
    'review.rejectAll': 'Reject All',
    'review.newFile': 'New file',
    'review.waiting': 'Waiting for user approval before writing to disk',
    'review.accepted': 'Accepted change',
    'review.rejected': 'Rejected change',
    'sidebar.noFolder': 'No folder open',
    'sidebar.openFolder': 'Open folder',
    'sidebar.newFolder': 'New folder',
    'sidebar.refreshTree': 'Refresh file tree',
    'sidebar.openInFinder': 'Open in Finder',
    'sidebar.delete': 'Delete',
    'sidebar.deletedFile': 'Deleted file',
    'sidebar.deletedFolder': 'Deleted folder',
    'sidebar.trashedFile': 'Moved file to Trash',
    'sidebar.trashedFolder': 'Moved folder to Trash',
    'settings.title': 'Settings',
    'settings.zenApiKey': 'ZenMux API Key',
    'settings.zenInvite': 'No API key? Use the recommended ZenMux invite link',
    'settings.zenBaseUrl': 'ZenMux Base URL',
    'settings.zenModel': 'ZenMux Model',
    'settings.ollamaUrl': 'Ollama Base URL',
    'settings.ollamaModel': 'Ollama Model (Local)',
    'settings.ollamaPull': 'Download Model',
    'settings.ollamaReasoning': 'Ollama Reasoning',
    'settings.ollamaReasoningToggle': 'Show raw local reasoning stream',
    'settings.ollamaReasoningHint': 'By default the UI only shows a thinking status. Enable this to also display the raw reasoning text returned by Ollama. Useful for debugging, but usually too noisy for normal use.',
    'settings.download': 'Pull',
    'settings.pulling': 'Pulling...',
    'settings.pullDone': 'Pull complete',
    'settings.noModels': 'No local models',
    'settings.modelCount': 'models',
    'settings.enterModelName': 'Enter a model name',
    'settings.customModelHint': 'Type any custom model name. Successful tests are saved to the list automatically.',
    'settings.openrouterApiKey': 'OpenRouter API Key',
    'settings.getOpenRouterKey': 'Get OpenRouter API Key',
    'settings.openrouterBaseUrl': 'OpenRouter Base URL',
    'settings.openrouterModel': 'OpenRouter Model',
    'settings.openrouterSiteUrl': 'OpenRouter Site URL (Optional)',
    'settings.openrouterSiteUrlHint': 'Used for rankings on openrouter.ai',
    'settings.openrouterSiteName': 'OpenRouter Site Name (Optional)',
    'settings.openrouterSiteNameHint': 'Used for rankings on openrouter.ai',
    'settings.toggleVisibility': 'Toggle visibility',
    'settings.nvidiaApiKey': 'NVIDIA API Key',
    'settings.getNvidiaKey': 'Get NVIDIA API Key',
    'settings.nvidiaBaseUrl': 'NVIDIA Base URL',
    'settings.nvidiaModel': 'NVIDIA Model',
    'settings.savedModelsSelect': 'Saved models',
    'settings.permissionMode': 'Permission Mode',
    'settings.permissionModeHint': 'default allows reads and reviewable edits; auto lifts the harness guardrails; plan allows planning and read-only work only.',
    'settings.pathRules': 'Path Rules',
    'settings.pathRulesHint': 'One rule per line: allow/deny + space + glob pattern.',
    'settings.deniedCommands': 'Denied Commands',
    'settings.deniedCommandsHint': 'One shell pattern per line. Matching commands are rejected immediately.',
    'settings.maxIterations': 'Max Iterations Per Turn',
    'settings.maxIterationsHint': 'Maximum tool-use and reasoning loops allowed in a single turn. Default: 100.',
    'settings.subtaskTimeout': 'Background Subtask Timeout (seconds)',
    'settings.subtaskTimeoutHint': 'Default run time for background subtasks. Timed-out tasks are stopped automatically.',
    'settings.memoryBundle': 'Memory Bundle',
    'settings.memoryBundleHint': 'Export, import, or reset AGENTS.md, CLAUDE.md, MEMORY.md, plus the auto-learned pitfalls store.',
    'settings.exportMemory': 'Export',
    'settings.importMemory': 'Import',
    'settings.resetMemory': 'Reset',
    'settings.memoryExported': 'Memory bundle exported',
    'settings.memoryImported': 'Memory bundle imported and staged for review',
    'settings.memoryReset': 'Managed memory reset and staged for review',
    'settings.memoryImportFail': 'Memory bundle import failed',
    'settings.memoryResetConfirm': 'Reset permanent memory and auto-learned pitfalls? This will stage reviewable changes.',
    'settings.refresh': 'Refresh',
    'settings.test': 'Test',
    'settings.save': 'Save',
    'settings.cancel': 'Cancel',
    'settings.saved': 'Settings saved',
    'settings.testOk': 'Connection OK',
    'settings.testSaved': 'Connection OK and saved',
    'settings.testFail': 'Connection failed',
    'chat.ollamaReasoning': 'Local reasoning stream (Ollama)',
    'chat.ollamaReasoningDone': 'Local reasoning stream (completed)',
    'terminal.ready': 'Terminal ready',
    'terminal.empty': 'Open a terminal or run a Python file',
    'terminal.new': 'New terminal',
    'terminal.shell': 'Shell',
    'terminal.running': 'Running',
    'terminal.exited': 'Exited',
    'terminal.python': 'Python interpreter',
    'terminal.runningFile': 'Running',
    'subtask.title': 'Background subtasks',
    'subtask.empty': 'No background subtasks',
    'subtask.running': 'Running',
    'subtask.stopping': 'Stopping',
    'subtask.exited': 'Exited',
    'subtask.timedOut': 'Timed out',
    'subtask.stop': 'Stop',
    'subtask.timeout': 'timeout',
    'preview.image': 'Image preview',
    'preview.pdf': 'PDF preview',
    'preview.loading': 'Loading preview...',
    'preview.zoom': 'Zoom',
    'preview.resetZoom': 'Reset zoom',
    'preview.prevPage': 'Previous page',
    'preview.nextPage': 'Next page',
    'preview.page': 'Page',
    'preview.dragHint': 'Drag to pan, use wheel or buttons to zoom',
    'preview.unsupported': 'Preview is not supported for this file type',
  }
};

const UI_PREF_KEYS = {
  lang: 'zen-cli.ui.lang',
  theme: 'zen-cli.ui.theme',
  sidebarWidth: 'zen-cli.ui.sidebarWidth',
  chatWidth: 'zen-cli.ui.chatWidth',
};

function readUiPreference(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) : null;
  } catch (e) {
    return null;
  }
}

function writeUiPreference(key, value) {
  try {
    if (window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch (e) {}
}

function loadSavedLang() {
  const saved = readUiPreference(UI_PREF_KEYS.lang);
  return saved === 'en-US' || saved === 'zh-CN' ? saved : 'zh-CN';
}

function loadSavedTheme() {
  const saved = readUiPreference(UI_PREF_KEYS.theme);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

let currentLang = loadSavedLang();

function t(key) { return (LANG[currentLang] || LANG['zh-CN'])[key] || key; }

function updateFolderLabel(workingDir) {
  const label = document.getElementById('folder-label');
  if (!label) return;

  if (workingDir) {
    label.textContent = workingDir.split(/[\\/]/).pop() || workingDir;
    label.title = workingDir;
    label.dataset.empty = 'false';
    return;
  }

  label.textContent = t('sidebar.noFolder');
  label.title = '';
  label.dataset.empty = 'true';
}

function applyLang() {
  document.documentElement.lang = currentLang;
  document.documentElement.setAttribute('lang', currentLang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.getElementById('lang-btn').textContent = currentLang === 'zh-CN' ? '中' : 'EN';
  const folderLabel = document.getElementById('folder-label');
  if (folderLabel && folderLabel.dataset.empty !== 'false') {
    updateFolderLabel('');
  }
  writeUiPreference(UI_PREF_KEYS.lang, currentLang);
  if (activeFile && !isEditing) {
    renderActiveFileView(activeFileContent, activeFileExt);
  }
  updateEditorActions();
  renderTerminalTabs();
  updateTerminalStatus();
  renderSubtasks();
  renderImagePreviews();
  renderSavedModelOptions('zenmux');
  renderSavedModelOptions('nvidia');
}

function toggleLang() {
  currentLang = currentLang === 'zh-CN' ? 'en-US' : 'zh-CN';
  applyLang();
  renderPendingChanges();
}

// ==================== Theme ====================
function applyTheme(theme) {
  const html = document.documentElement;
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  html.setAttribute('data-theme', nextTheme);
  document.getElementById('hljs-dark-theme').disabled = nextTheme === 'light';
  document.getElementById('hljs-light-theme').disabled = nextTheme !== 'light';
  document.getElementById('theme-btn').textContent = nextTheme === 'light' ? '\u2600' : '\u263e';
  writeUiPreference(UI_PREF_KEYS.theme, nextTheme);
  // Re-highlight if file is open
  if (activeFile) {
    if (isEditing) renderEditHighlight(document.getElementById('edit-textarea').value, activeFileExt);
    else renderActiveFileView(activeFileContent, activeFileExt);
  }
  applyTerminalThemes();
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(isDark ? 'light' : 'dark');
}

function toggleMaximize() {
  try { fetch('/api/window/toggle-maximize', { method: 'POST' }); } catch { /* ignore */ }
}

function minimizeWindow() {
  try { fetch('/api/window/minimize', { method: 'POST' }); } catch { /* ignore */ }
}

function closeWindow() {
  try { fetch('/api/window/close', { method: 'POST' }); } catch { /* ignore */ }
}

// ==================== State ====================
let isProcessing = false;
let currentAssistantEl = null;
let currentContentEl = null;
let currentReasoningEl = null;
let currentReasoningPreEl = null;
let currentReasoningSummaryEl = null;
let lastReasoningText = '';
let activeProvider = '';
let providerList = [];
let showOllamaReasoning = false;
let activeFile = null;
let activeFileContent = '';
let activeFileExt = '';
let activeFilePreview = null;
let isEditing = false;
let activePythonInterpreter = null;
let activePythonInterpreterToken = 0;
let openTabs = []; // {path, name, modified}
let pendingChanges = [];
let activePendingPath = null;
let attachedContextFiles = [];
let treeFileIndex = [];
let mentionResults = [];
let mentionActiveIndex = 0;
let mentionSession = null;
let mentionSearchToken = 0;
let mentionSearchTimer = null;
const mentionQueryCache = new Map();
const mentionRequestCache = new Map();
let terminalSessions = [];
let backgroundSubtasks = [];
let activeTerminalId = null;
const terminalViews = new Map();
let editTextarea = null;
let editHighlight = null;
let savedModelHistory = { zenmux: [], nvidia: [] };
let activePreviewState = {
  kind: '',
  url: '',
  mimeType: '',
  zoom: 1,
  initialZoom: 1,
  zoomInitialized: false,
  pdfDoc: null,
  pdfPage: 1,
  pdfPageCount: 0,
  renderToken: 0,
};
let pdfJsPromise = null;
let mainEl = null;
let sidebarEl = null;
let chatPanelEl = null;
let sidebarResizerEl = null;
let chatResizerEl = null;
const PANEL_LAYOUT = {
  sidebarDefault: 220,
  sidebarMin: 140,
  sidebarMax: 460,
  chatDefault: 380,
  chatMin: 240,
  chatMax: 720,
  editorMin: 260,
  resizerWidth: 8,
};
let panelLayoutState = {
  sidebarWidth: PANEL_LAYOUT.sidebarDefault,
  chatWidth: PANEL_LAYOUT.chatDefault,
  dragging: null,
  dragStartX: 0,
  dragStartWidth: 0,
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  initPanelResizers();
  editTextarea = document.getElementById('edit-textarea');
  editHighlight = document.getElementById('edit-highlight');
  if (!editTextarea || !editHighlight) return;

  editTextarea.addEventListener('input', () => {
    renderEditHighlight(editTextarea.value, activeFileExt);
    updateActiveTabModified(editTextarea.value !== activeFileContent);
  });
  editTextarea.addEventListener('scroll', syncEditHighlightScroll);
});

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMainPanelWidth() {
  if (mainEl && Number(mainEl.clientWidth) > 0) return Number(mainEl.clientWidth);
  if (typeof window.innerWidth === 'number' && window.innerWidth > 0) return window.innerWidth;
  return 1280;
}

function getStoredPanelWidths() {
  const sidebarWidth = Number(panelLayoutState.sidebarWidth)
    || (sidebarEl ? (parseFloat(sidebarEl.style.width) || Number(sidebarEl.clientWidth) || PANEL_LAYOUT.sidebarDefault) : PANEL_LAYOUT.sidebarDefault);
  const chatWidth = Number(panelLayoutState.chatWidth)
    || (chatPanelEl ? (parseFloat(chatPanelEl.style.width) || Number(chatPanelEl.clientWidth) || PANEL_LAYOUT.chatDefault) : PANEL_LAYOUT.chatDefault);
  return { sidebarWidth, chatWidth };
}

function normalizePanelWidths(nextSidebarWidth, nextChatWidth) {
  const current = getStoredPanelWidths();
  let sidebarWidth = Number.isFinite(nextSidebarWidth) ? Number(nextSidebarWidth) : current.sidebarWidth;
  let chatWidth = Number.isFinite(nextChatWidth) ? Number(nextChatWidth) : current.chatWidth;

  const getSidebarMax = function(activeChatWidth) {
    return Math.max(
      PANEL_LAYOUT.sidebarMin,
      Math.min(
        PANEL_LAYOUT.sidebarMax,
        getMainPanelWidth() - PANEL_LAYOUT.editorMin - PANEL_LAYOUT.resizerWidth * 2 - activeChatWidth,
      ),
    );
  };
  const getChatMax = function(activeSidebarWidth) {
    return Math.max(
      PANEL_LAYOUT.chatMin,
      Math.min(
        PANEL_LAYOUT.chatMax,
        getMainPanelWidth() - PANEL_LAYOUT.editorMin - PANEL_LAYOUT.resizerWidth * 2 - activeSidebarWidth,
      ),
    );
  };

  sidebarWidth = clampNumber(sidebarWidth, PANEL_LAYOUT.sidebarMin, getSidebarMax(chatWidth));
  chatWidth = clampNumber(chatWidth, PANEL_LAYOUT.chatMin, getChatMax(sidebarWidth));
  sidebarWidth = clampNumber(sidebarWidth, PANEL_LAYOUT.sidebarMin, getSidebarMax(chatWidth));

  return {
    sidebarWidth: Math.round(sidebarWidth),
    chatWidth: Math.round(chatWidth),
  };
}

function setPanelWidths(nextSidebarWidth, nextChatWidth, options) {
  if (!sidebarEl || !chatPanelEl) return null;
  const settings = options || {};
  const normalized = normalizePanelWidths(nextSidebarWidth, nextChatWidth);

  panelLayoutState.sidebarWidth = normalized.sidebarWidth;
  panelLayoutState.chatWidth = normalized.chatWidth;

  sidebarEl.style.width = normalized.sidebarWidth + 'px';
  chatPanelEl.style.width = normalized.chatWidth + 'px';

  if (settings.persist !== false) {
    writeUiPreference(UI_PREF_KEYS.sidebarWidth, String(normalized.sidebarWidth));
    writeUiPreference(UI_PREF_KEYS.chatWidth, String(normalized.chatWidth));
  }

  return normalized;
}

function restorePanelLayout() {
  const savedSidebarWidth = readNumericUiPreference(UI_PREF_KEYS.sidebarWidth);
  const savedChatWidth = readNumericUiPreference(UI_PREF_KEYS.chatWidth);
  setPanelWidths(
    savedSidebarWidth == null ? PANEL_LAYOUT.sidebarDefault : savedSidebarWidth,
    savedChatWidth == null ? PANEL_LAYOUT.chatDefault : savedChatWidth,
    { persist: false },
  );
}

function startPanelResize(kind, event) {
  if (!sidebarResizerEl || !chatResizerEl) return;
  panelLayoutState.dragging = kind;
  panelLayoutState.dragStartX = Number(event.clientX) || 0;
  panelLayoutState.dragStartWidth = kind === 'sidebar'
    ? getStoredPanelWidths().sidebarWidth
    : getStoredPanelWidths().chatWidth;

  document.body.classList.add('panel-resizing');
  (kind === 'sidebar' ? sidebarResizerEl : chatResizerEl).classList.add('active');

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
}

function handlePanelResizeMove(event) {
  if (!panelLayoutState.dragging || typeof event.clientX !== 'number') return;

  const deltaX = event.clientX - panelLayoutState.dragStartX;
  if (panelLayoutState.dragging === 'sidebar') {
    setPanelWidths(panelLayoutState.dragStartWidth + deltaX, undefined);
  } else {
    setPanelWidths(undefined, panelLayoutState.dragStartWidth - deltaX);
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
}

function stopPanelResize() {
  if (!panelLayoutState.dragging) return;

  panelLayoutState.dragging = null;
  document.body.classList.remove('panel-resizing');
  if (sidebarResizerEl) sidebarResizerEl.classList.remove('active');
  if (chatResizerEl) chatResizerEl.classList.remove('active');
}

function initPanelResizers() {
  mainEl = document.getElementById('main');
  sidebarEl = document.getElementById('sidebar');
  chatPanelEl = document.getElementById('chat-panel');
  sidebarResizerEl = document.getElementById('sidebar-resizer');
  chatResizerEl = document.getElementById('chat-resizer');

  if (!mainEl || !sidebarEl || !chatPanelEl || !sidebarResizerEl || !chatResizerEl) return;

  restorePanelLayout();

  sidebarResizerEl.addEventListener('mousedown', function(event) {
    startPanelResize('sidebar', event);
  });
  chatResizerEl.addEventListener('mousedown', function(event) {
    startPanelResize('chat', event);
  });

  document.addEventListener('mousemove', handlePanelResizeMove);
  document.addEventListener('mouseup', stopPanelResize);
  window.addEventListener('blur', stopPanelResize);
  window.addEventListener('resize', function() {
    setPanelWidths(panelLayoutState.sidebarWidth, panelLayoutState.chatWidth, { persist: false });
  });
}

document.addEventListener('wheel', function(event) {
  if (!activePreviewState.kind) return;
  if (!isPreviewInteractionTarget(event.target)) return;
  if (!event.ctrlKey && !event.metaKey) return;

  event.preventDefault();
  zoomPreviewByWheel(event.deltaY);
}, { passive: false, capture: true });

// ==================== Provider ====================
function renderProviders() {
  const bar = document.getElementById('provider-bar');
  bar.innerHTML = '';
  for (const p of providerList) {
    const btn = document.createElement('span');
    btn.className = 'pill' + (p.type === activeProvider ? ' active' : '') + (!p.available ? ' unavailable' : '');
    btn.innerHTML = '<span class="dot"></span>' + esc(p.name);
    btn.title = p.baseUrl + ' -> ' + p.model;
    if (p.available) {
      btn.onclick = () => doSwitchProvider(p.type);
    } else {
      btn.onclick = () => {
        const msg = currentLang === 'zh-CN'
          ? p.name + ' 不可用，请在设置中配置 API Key 后刷新'
          : p.name + ' unavailable — configure API key in Settings, then refresh';
        addMsg('system', msg);
        openSettings();
      };
    }
    bar.appendChild(btn);
  }
  const a = providerList.find(p => p.type === activeProvider);
  if (a) { document.getElementById('model-label').textContent = a.model; }
}

async function doSwitchProvider(type) {
  if (type === activeProvider || isProcessing) return;
  try {
    const r = await (await fetch('/api/providers/switch', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({provider:type}) })).json();
    if (r.success) { activeProvider = r.provider; addMsg('system','Switched to '+r.provider+' ('+r.model+')'); renderProviders(); }
    else addMsg('system','Switch failed: '+(r.error||''));
  } catch(e) { addMsg('system','Switch failed: '+e.message); }
}

async function refreshProviders() {
  try {
    const r = await (await fetch('/api/providers/refresh',{method:'POST'})).json();
    providerList = r.providers||[]; activeProvider = r.active; renderProviders();
    addMsg('system', currentLang==='zh-CN' ? '已刷新供应商状态' : 'Providers refreshed');
  } catch(e) { addMsg('system','Refresh failed: '+e.message); }
}

// ==================== File Tree ====================
async function loadFileTree(dir) {
  try {
    const r = await (await fetch('/api/files?path='+(dir||'.')+'&depth=3')).json();
    setTreeFileIndex(r.tree || []);
    renderTree(r.tree || [], document.getElementById('file-tree'), 0);
    updateActiveTreeSelection();
  } catch(e) { console.error(e); }
}

function renderTree(entries, container, depth) {
  container.innerHTML = '';
  for (const e of entries) {
    if (e.type === 'directory') {
      const div = document.createElement('div');
      div.className = 'tree-dir';
      const shouldOpen = !!activeFile && isSamePathOrChild(activeFile, e.path);
      if (shouldOpen) div.classList.add('open');
      const item = document.createElement('div');
      item.className = 'tree-item';
      item.dataset.path = e.path;
      item.dataset.entryType = e.type;
      item.style.paddingLeft = (8 + depth * 14) + 'px';
      item.innerHTML =
        '<span class="tree-icon">' + (shouldOpen ? '&#9660;' : '&#9654;') + '</span>' +
        '<span class="tree-name">' + esc(e.name) + '</span>';
      const actions = document.createElement('div');
      actions.className = 'tree-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tree-action-btn';
      deleteBtn.title = t('sidebar.delete');
      deleteBtn.textContent = '×';
      deleteBtn.onclick = (ev) => {
        ev.stopPropagation();
        void deleteTreeEntry(e.path, e.type, e.name);
      };
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      item.onclick = (ev) => { ev.stopPropagation(); div.classList.toggle('open'); item.querySelector('.tree-icon').innerHTML = div.classList.contains('open') ? '&#9660;' : '&#9654;'; };
      item.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); showTreeContextMenu(ev, e.path, e.type); };
      div.appendChild(item);
      const children = document.createElement('div');
      children.className = 'tree-children';
      if (e.children) renderTree(e.children, children, depth+1);
      div.appendChild(children);
      container.appendChild(div);
    } else {
      const item = document.createElement('div');
      item.className = 'tree-item';
       item.dataset.path = e.path;
      item.dataset.entryType = e.type;
      item.style.paddingLeft = (8 + depth * 14) + 'px';
      const icon = getFileIcon(e.name);
      item.innerHTML = '<span class="tree-icon">' + icon + '</span><span class="tree-name">' + esc(e.name) + '</span>';
      const actions = document.createElement('div');
      actions.className = 'tree-actions';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tree-action-btn';
      deleteBtn.title = t('sidebar.delete');
      deleteBtn.textContent = '×';
      deleteBtn.onclick = (ev) => {
        ev.stopPropagation();
        void deleteTreeEntry(e.path, e.type, e.name);
      };
      actions.appendChild(deleteBtn);
      item.appendChild(actions);
      item.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); showTreeContextMenu(ev, e.path, e.type); };
      item.onclick = () => openFile(e.path, e.name);
      container.appendChild(item);
    }
  }
}

function readNumericUiPreference(key) {
  const raw = readUiPreference(key);
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {ts:'TS',js:'JS',json:'{}',md:'#',html:'<>',css:'#',py:'Py',rs:'Rs',go:'Go',java:'Jv',c:'C',cpp:'C+',sh:'$',yml:'Y',yaml:'Y',toml:'T',txt:'T',svg:'Im',png:'Im',jpg:'Im',jpeg:'Im',gif:'Im',webp:'Im',bmp:'Im',pdf:'PDF',gitignore:'G'};
  return '<small>'+(map[ext]||'·')+'</small>';
}

async function openFolderDialog() {
  await chooseFolder('open');
}

let contextMenuTarget = { path: '', type: 'file' };

function showTreeContextMenu(ev, path, type) {
  contextMenuTarget = { path, type };
  const menu = document.getElementById('tree-context-menu');
  if (!menu) return;
  menu.style.display = 'block';
  menu.style.left = ev.clientX + 'px';
  menu.style.top = ev.clientY + 'px';
}

function hideTreeContextMenu() {
  const menu = document.getElementById('tree-context-menu');
  if (menu) menu.style.display = 'none';
}

async function openTreeItemAsRoot() {
  hideTreeContextMenu();
  if (!contextMenuTarget.path) return;
  try {
    const r = await (await fetch('/api/folder/open', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ path: contextMenuTarget.path }),
    })).json();
    if (r.success) {
      applyWorkingDirectory(r);
      addMsg('system', (currentLang==='zh-CN' ? '已打开: ' : 'Opened: ') + r.workingDir);
    } else {
      addMsg('system', 'Error: ' + (r.error || ''));
    }
  } catch (e) {
    addMsg('system', 'Failed: ' + e.message);
  }
}

async function createFolderInTreeItem() {
  hideTreeContextMenu();
  if (!contextMenuTarget.path) return;
  const parentDir = contextMenuTarget.type === 'directory' ? contextMenuTarget.path : contextMenuTarget.path.replace(/\/[^/]+$/, '');
  const name = prompt(currentLang==='zh-CN' ? '输入新文件夹名称:' : 'Enter new folder name:', 'new-folder');
  if (!name) return;
  try {
    const r = await (await fetch('/api/folder/create-in', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ parent: parentDir, name }),
    })).json();
    if (r.success) {
      await loadFileTree('.');
      addMsg('system', (currentLang==='zh-CN' ? '已创建文件夹: ' : 'Created folder: ') + r.path);
    } else {
      addMsg('system', 'Error: ' + (r.error || ''));
    }
  } catch (e) {
    addMsg('system', 'Failed: ' + e.message);
  }
}

async function createFolderInCurrentDir() {
  const cwd = document.getElementById('folder-label')?.title || '.';
  const name = prompt(currentLang==='zh-CN' ? '输入新文件夹名称:' : 'Enter new folder name:', 'new-folder');
  if (!name) return;
  try {
    const r = await (await fetch('/api/folder/create-in', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ parent: cwd, name }),
    })).json();
    if (r.success) {
      await loadFileTree('.');
      addMsg('system', (currentLang==='zh-CN' ? '已创建文件夹: ' : 'Created folder: ') + r.path);
    } else {
      addMsg('system', 'Error: ' + (r.error || ''));
    }
  } catch (e) {
    addMsg('system', 'Failed: ' + e.message);
  }
}

async function createFolderDialog() {
  await chooseFolder('create');
}

async function chooseFolder(mode) {
  const nativeEndpoint = mode === 'create' ? '/api/dialog/create-folder' : '/api/dialog/open-folder';

  try {
    const r = await (await fetch(nativeEndpoint, { method: 'POST' })).json();
    if (r.success) {
      applyWorkingDirectory(r);
      addMsg('system', (currentLang==='zh-CN' ? '已打开: ' : 'Opened: ') + r.workingDir);
      return;
    }
    if (r.cancelled) return;
    if (!r.unsupported && r.error) {
      addMsg('system', 'Error: ' + r.error);
      return;
    }
  } catch (e) {
    console.error('Native folder picker failed:', e);
  }

  if (mode === 'create') {
    const input = prompt(currentLang==='zh-CN' ? '输入新文件夹路径:' : 'Enter new folder path:', '');
    if (!input) return;
    try {
      const r = await (await fetch('/api/folder/create', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({path:input}),
      })).json();
      if (r.success) {
        applyWorkingDirectory(r);
        addMsg('system', (currentLang==='zh-CN' ? '已新建并打开: ' : 'Created and opened: ') + r.workingDir);
      } else {
        addMsg('system', 'Error: ' + (r.error || ''));
      }
    } catch (e) {
      addMsg('system','Failed: ' + e.message);
    }
    return;
  }

  const input = prompt(currentLang==='zh-CN' ? '输入文件夹路径:' : 'Enter folder path:', '');
  if (!input) return;
  try {
    const r = await (await fetch('/api/folder/open',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:input}),
    })).json();
    if (r.success) {
      applyWorkingDirectory(r);
      addMsg('system', (currentLang==='zh-CN'?'已打开: ':'Opened: ') + r.workingDir);
    } else {
      addMsg('system', 'Error: '+(r.error||''));
    }
  } catch(e) { addMsg('system','Failed: '+e.message); }
}

function applyWorkingDirectory(data) {
  if (!data || !data.workingDir) return;
  mentionQueryCache.clear();
  mentionRequestCache.clear();
  hideMentionMenu();
  updateFolderLabel(data.workingDir);
  if (data.tree) {
    setTreeFileIndex(data.tree || []);
    renderTree(data.tree || [], document.getElementById('file-tree'), 0);
    updateActiveTreeSelection();
  } else {
    setTreeFileIndex([]);
    loadFileTree('.');
  }
  refreshPendingChanges();
  restartTerminalsForNewWorkingDir(data.workingDir);
}

async function restartTerminalsForNewWorkingDir(newWorkingDir) {
  if (!terminalSessions || terminalSessions.length === 0) return;

  const oldSessions = terminalSessions.slice();
  for (const session of oldSessions) {
    try {
      await fetch('/api/terminal/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
    } catch { /* ignore */ }
  }

  terminalSessions = [];
  terminalViews.clear();
  activeTerminalId = null;

  const viewsContainer = document.getElementById('terminal-views');
  if (viewsContainer) viewsContainer.innerHTML = '';

  const terminalTabs = document.getElementById('terminal-tabs');
  if (terminalTabs) terminalTabs.innerHTML = '';

  try {
    const r = await (await fetch('/api/terminal/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t('terminal.shell'), cwd: newWorkingDir }),
    })).json();
    if (r.success) {
      upsertTerminalSession(r.session, true);
    }
  } catch (e) {
    console.error('Failed to recreate terminal after working dir change:', e);
  }
}

function setTreeFileIndex(entries) {
  treeFileIndex = flattenTreeEntries(entries || []);
}

function flattenTreeEntries(entries) {
  const files = [];

  function visit(items) {
    for (const item of items || []) {
      files.push({ path: item.path, name: item.name, type: item.type });
      if (item.type === 'directory') visit(item.children || []);
    }
  }

  visit(entries);
  return files.sort(function(a, b) {
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
  });
}

function isSamePathOrChild(filePath, basePath) {
  const normalizedFile = String(filePath || '').replace(/\/+$/, '');
  const normalizedBase = String(basePath || '').replace(/\/+$/, '');
  if (!normalizedFile || !normalizedBase) return false;
  return normalizedFile === normalizedBase || normalizedFile.startsWith(normalizedBase + '/');
}

function updateActiveTreeSelection() {
  document.querySelectorAll('.tree-item').forEach(function(el) {
    const itemPath = el.dataset ? el.dataset.path : '';
    const entryType = el.dataset ? el.dataset.entryType : '';
    el.classList.toggle('active', entryType === 'file' && itemPath === activeFile);
  });
}

function getDeleteConfirmationText(filePath, entryType, entryName) {
  const label = entryName || filePath;
  if (entryType === 'directory') {
    return currentLang === 'zh-CN'
      ? ('确认将文件夹 "' + label + '" 移到废纸篓？其中的子文件和子文件夹会一起移动。')
      : ('Move folder "' + label + '" to Trash with all nested files and folders?');
  }
  return currentLang === 'zh-CN'
    ? ('确认将文件 "' + label + '" 移到废纸篓？')
    : ('Move file "' + label + '" to Trash?');
}

async function deleteTreeEntry(filePath, entryType, entryName) {
  const message = getDeleteConfirmationText(filePath, entryType, entryName);
  if (typeof window.confirm === 'function' && !window.confirm(message)) return;

  try {
    const r = await (await fetch('/api/file/delete', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ path: filePath }),
    })).json();

    if (!r.success) {
      addMsg('system', 'Delete failed: ' + (r.error || ''));
      return;
    }

    await handleDeletedPath(filePath);
    await loadFileTree('.');
    await refreshPendingChanges();
    const label = r.trashed
      ? (entryType === 'directory' ? t('sidebar.trashedFolder') : t('sidebar.trashedFile'))
      : (entryType === 'directory' ? t('sidebar.deletedFolder') : t('sidebar.deletedFile'));
    addMsg('system', label + ': ' + filePath);
  } catch (e) {
    addMsg('system', 'Delete failed: ' + e.message);
  }
}

async function handleDeletedPath(targetPath) {
  const removedActive = !!activeFile && isSamePathOrChild(activeFile, targetPath);
  const remainingTabs = openTabs.filter(function(tab) {
    return !isSamePathOrChild(tab.path, targetPath);
  });
  const nextTab = removedActive && remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null;

  openTabs = remainingTabs;
  renderTabs();

  if (!removedActive) {
    updateActiveTreeSelection();
    updateEditorActions();
    return;
  }

  resetEditorPane();
  if (nextTab) {
    await openFile(nextTab.path, nextTab.name);
  }
}

// ==================== Editor ====================
async function openFile(filePath, fileName) {
  try {
    const r = await (await fetch('/api/file?path='+encodeURIComponent(filePath))).json();
    if (r.error) { addMsg('system','Error: '+r.error); return; }

    activeFile = filePath;
    activeFileContent = typeof r.content === 'string' ? r.content : '';
    activeFileExt = r.extension || '';
    activeFilePreview = r.previewKind ? {
      kind: r.previewKind,
      url: r.previewUrl || '',
      mimeType: r.mimeType || '',
    } : null;
    activePythonInterpreter = null;
    resetPreviewState(activeFilePreview);

    // Add tab
    if (!openTabs.find(t=>t.path===filePath)) openTabs.push({path:filePath, name:fileName, modified:false});
    renderTabs();

    exitEditMode();
    document.getElementById('editor-welcome').style.display = 'none';
    renderActiveFileView(r.content, r.extension);
    setEditorInfo(filePath, r.extension, r.size);
    updateEditorActions();
    if (isPythonFile(r.extension) && !activeFilePreview) {
      refreshActivePythonInterpreter(filePath, r.extension, r.size);
    }

    updateActiveTreeSelection();
  } catch(e) { addMsg('system','Open failed: '+e.message); }
}

function renderActiveFileView(content, ext) {
  const codeView = document.getElementById('code-view');
  const previewView = document.getElementById('preview-view');
  if (activeFilePreview && activeFilePreview.kind === 'image') {
    codeView.style.display = 'none';
    previewView.style.display = 'block';
    renderImagePreview();
    return;
  }
  if (activeFilePreview && activeFilePreview.kind === 'pdf') {
    codeView.style.display = 'none';
    previewView.style.display = 'block';
    void renderPdfPreview();
    return;
  }
  if (isMarkdownFile(ext, activeFile)) {
    codeView.style.display = 'none';
    previewView.style.display = 'block';
    renderMarkdownPreview(content);
    return;
  }

  previewView.style.display = 'none';
  codeView.style.display = 'block';
  renderCodeView(content, ext);
}

function renderCodeView(content, ext) {
  const cv = document.getElementById('code-view');
  const lines = content.split('\n');
  let html = '<table>';
  for (let i = 0; i < lines.length; i++) {
    const lineContent = lines[i];
    html += '<tr><td class="ln">' + (i+1) + '</td><td class="code-line">';
    // We'll do inline highlight
    html += '<pre><code class="language-' + mapExt(ext) + '">' + escCode(lineContent) + '</code></pre>';
    html += '</td></tr>';
  }
  html += '</table>';
  cv.innerHTML = html;

  // Apply highlight.js to each code element
  cv.querySelectorAll('pre code').forEach(block => {
    try { hljs.highlightElement(block); } catch(e) {}
  });
}

function renderMarkdownPreview(content) {
  const preview = document.getElementById('preview-view');
  preview.innerHTML = '<div class="markdown-preview-wrap"><div class="markdown-body">' + renderMarkdown(content) + '</div></div>';
  highlightMarkdownBlocks(preview);
  renderMathContent(preview);
}

function resetPreviewState(previewInfo) {
  activePreviewState.kind = previewInfo ? previewInfo.kind : '';
  activePreviewState.url = previewInfo ? previewInfo.url : '';
  activePreviewState.mimeType = previewInfo ? previewInfo.mimeType : '';
  activePreviewState.zoom = 1;
  activePreviewState.initialZoom = 1;
  activePreviewState.zoomInitialized = false;
  activePreviewState.pdfDoc = null;
  activePreviewState.pdfPage = 1;
  activePreviewState.pdfPageCount = 0;
  activePreviewState.renderToken += 1;
}

function clampPreviewZoom(value) {
  return Math.max(0.2, Math.min(5, value));
}

function computeInitialPreviewZoom(contentWidth) {
  const shell = document.getElementById('preview-pan-shell');
  const availableWidth = Math.max(((shell && shell.clientWidth) || 960) - 40, 240);
  return clampPreviewZoom(Math.min(1, availableWidth / Math.max(contentWidth || 1, 1)));
}

function buildPreviewShellHtml(stageHtml) {
  return (
    '<div class="preview-shell">' +
      '<div class="preview-toolbar" id="preview-toolbar"></div>' +
      '<div class="preview-pan-shell" id="preview-pan-shell">' +
        '<div class="preview-stage centered" id="preview-stage">' + (stageHtml || '') + '</div>' +
      '</div>' +
    '</div>'
  );
}

function updatePreviewToolbar() {
  const toolbar = document.getElementById('preview-toolbar');
  if (!toolbar || !activePreviewState.kind) return;

  const kindLabel = activePreviewState.kind === 'pdf' ? t('preview.pdf') : t('preview.image');
  const zoomLabel = Math.round(activePreviewState.zoom * 100) + '%';
  let controls = '';

  if (activePreviewState.kind === 'pdf') {
    controls +=
      '<button type="button" onclick="changePdfPage(-1)"' + (activePreviewState.pdfPage <= 1 ? ' disabled' : '') + '>' + esc(t('preview.prevPage')) + '</button>' +
      '<span class="preview-toolbar-label">' + esc(t('preview.page')) + ' ' + activePreviewState.pdfPage + ' / ' + Math.max(activePreviewState.pdfPageCount || 0, 1) + '</span>' +
      '<button type="button" onclick="changePdfPage(1)"' + (activePreviewState.pdfPage >= activePreviewState.pdfPageCount ? ' disabled' : '') + '>' + esc(t('preview.nextPage')) + '</button>';
  }

  controls +=
    '<button type="button" onclick="zoomPreview(-1)">-</button>' +
    '<span class="preview-toolbar-label">' + esc(t('preview.zoom')) + ' ' + zoomLabel + '</span>' +
    '<button type="button" onclick="zoomPreview(1)">+</button>' +
    '<button type="button" onclick="resetPreviewZoom()">' + esc(t('preview.resetZoom')) + '</button>';

  toolbar.innerHTML =
    '<div class="preview-toolbar-group">' +
      '<span class="preview-toolbar-label">' + esc(kindLabel) + '</span>' +
      '<span class="preview-toolbar-label">' + esc(t('preview.dragHint')) + '</span>' +
    '</div>' +
    '<div class="preview-toolbar-group">' + controls + '</div>';
}

function capturePreviewAnchor() {
  const shell = document.getElementById('preview-pan-shell');
  if (!shell) return null;

  const width = Math.max(shell.scrollWidth, 1);
  const height = Math.max(shell.scrollHeight, 1);
  return {
    x: (shell.scrollLeft + shell.clientWidth / 2) / width,
    y: (shell.scrollTop + shell.clientHeight / 2) / height,
  };
}

function restorePreviewAnchor(anchor) {
  if (!anchor) return;
  const shell = document.getElementById('preview-pan-shell');
  if (!shell) return;

  setTimeout(function() {
    shell.scrollLeft = Math.max(0, anchor.x * shell.scrollWidth - shell.clientWidth / 2);
    shell.scrollTop = Math.max(0, anchor.y * shell.scrollHeight - shell.clientHeight / 2);
  }, 0);
}

function isPreviewInteractionTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('#preview-view');
}

function ensurePreviewPanInteractions() {
  const shell = document.getElementById('preview-pan-shell');
  if (!shell || shell.dataset.bound === 'true') return;

  shell.dataset.bound = 'true';
  let dragState = null;

  function endDrag(event) {
    dragState = null;
    shell.classList.remove('dragging');
    if (event && typeof shell.releasePointerCapture === 'function' && typeof event.pointerId === 'number') {
      try { shell.releasePointerCapture(event.pointerId); } catch (e) {}
    }
  }

  shell.addEventListener('pointerdown', function(event) {
    if (event.button !== 0) return;
    if (shell.scrollWidth <= shell.clientWidth && shell.scrollHeight <= shell.clientHeight) return;

    dragState = {
      x: event.clientX,
      y: event.clientY,
      left: shell.scrollLeft,
      top: shell.scrollTop,
    };
    shell.classList.add('dragging');
    if (typeof shell.setPointerCapture === 'function' && typeof event.pointerId === 'number') {
      try { shell.setPointerCapture(event.pointerId); } catch (e) {}
    }
    event.preventDefault();
  });

  shell.addEventListener('pointermove', function(event) {
    if (!dragState) return;
    shell.scrollLeft = dragState.left - (event.clientX - dragState.x);
    shell.scrollTop = dragState.top - (event.clientY - dragState.y);
  });
  shell.addEventListener('pointerup', endDrag);
  shell.addEventListener('pointercancel', endDrag);
}

function applyImagePreviewZoom(anchor) {
  const image = document.getElementById('preview-image');
  const stage = document.getElementById('preview-stage');
  const shell = document.getElementById('preview-pan-shell');
  if (!image || !stage || !shell) return;

  const naturalWidth = image.naturalWidth || image.width || 1;
  const naturalHeight = image.naturalHeight || image.height || 1;
  const width = naturalWidth * activePreviewState.zoom;
  const height = naturalHeight * activePreviewState.zoom;

  image.style.width = width + 'px';
  image.style.height = height + 'px';
  stage.classList.toggle('centered', width + 40 < shell.clientWidth && height + 40 < shell.clientHeight);
  updatePreviewToolbar();
  restorePreviewAnchor(anchor);
}

function renderImagePreview() {
  const preview = document.getElementById('preview-view');
  if (!preview || !activePreviewState.url) return;

  preview.innerHTML = buildPreviewShellHtml(
    '<img id="preview-image" class="preview-image" src="' + esc(activePreviewState.url) + '" alt="' + esc(activeFile || 'image') + '" draggable="false" />',
  );
  ensurePreviewPanInteractions();
  updatePreviewToolbar();

  const image = document.getElementById('preview-image');
  if (!image) return;

  image.onload = function() {
    if (!activePreviewState.zoomInitialized) {
      activePreviewState.initialZoom = computeInitialPreviewZoom(image.naturalWidth || image.width || 1);
      activePreviewState.zoom = activePreviewState.initialZoom;
      activePreviewState.zoomInitialized = true;
    }
    applyImagePreviewZoom();
  };
  image.onerror = function() {
    const stage = document.getElementById('preview-stage');
    if (stage) {
      stage.innerHTML = '<div class="preview-empty">' + esc(t('preview.unsupported')) + '</div>';
    }
  };

  setTimeout(function() {
    if (image.complete) image.onload();
  }, 0);
}

async function loadPdfJs() {
  if (window.__ZEN_PDFJS__) return window.__ZEN_PDFJS__;
  if (!pdfJsPromise) {
    pdfJsPromise = import('/modules/pdfjs-dist/legacy/build/pdf.mjs').then(function(mod) {
      mod.GlobalWorkerOptions.workerSrc = '/modules/pdfjs-dist/legacy/build/pdf.worker.mjs';
      window.__ZEN_PDFJS__ = mod;
      return mod;
    });
  }
  return await pdfJsPromise;
}

async function renderPdfPreview(anchor) {
  const preview = document.getElementById('preview-view');
  if (!preview || !activePreviewState.url) return;

  preview.innerHTML = buildPreviewShellHtml(
    '<div class="preview-empty">' + esc(t('preview.loading')) + '</div>',
  );
  ensurePreviewPanInteractions();
  updatePreviewToolbar();

  const stage = document.getElementById('preview-stage');
  const renderToken = ++activePreviewState.renderToken;

  try {
    const pdfjs = await loadPdfJs();
    if (renderToken !== activePreviewState.renderToken || activePreviewState.kind !== 'pdf') return;

    if (!activePreviewState.pdfDoc) {
      const loadingTask = pdfjs.getDocument({
        url: activePreviewState.url,
        cMapUrl: '/modules/pdfjs-dist/cmaps/',
        cMapPacked: true,
        standardFontDataUrl: '/modules/pdfjs-dist/standard_fonts/',
      });
      activePreviewState.pdfDoc = await loadingTask.promise;
      activePreviewState.pdfPageCount = activePreviewState.pdfDoc.numPages || 0;
      if (activePreviewState.pdfPage > activePreviewState.pdfPageCount) {
        activePreviewState.pdfPage = Math.max(activePreviewState.pdfPageCount, 1);
      }
    }

    const page = await activePreviewState.pdfDoc.getPage(activePreviewState.pdfPage);
    if (renderToken !== activePreviewState.renderToken || activePreviewState.kind !== 'pdf') return;

    const baseViewport = page.getViewport({ scale: 1 });
    if (!activePreviewState.zoomInitialized) {
      activePreviewState.initialZoom = computeInitialPreviewZoom(baseViewport.width);
      activePreviewState.zoom = activePreviewState.initialZoom;
      activePreviewState.zoomInitialized = true;
    }

    const viewport = page.getViewport({ scale: activePreviewState.zoom });
    const devicePixelRatio = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Canvas context unavailable');

    canvas.className = 'preview-pdf-canvas';
    canvas.width = Math.max(1, Math.floor(viewport.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(viewport.height * devicePixelRatio));
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';
    canvas.draggable = false;

    stage.innerHTML = '';
    stage.classList.remove('centered');
    stage.appendChild(canvas);

    await page.render({
      canvasContext: context,
      viewport,
      transform: devicePixelRatio === 1 ? null : [devicePixelRatio, 0, 0, devicePixelRatio, 0, 0],
    }).promise;

    const shell = document.getElementById('preview-pan-shell');
    if (shell) {
      stage.classList.toggle('centered', viewport.width + 40 < shell.clientWidth && viewport.height + 40 < shell.clientHeight);
    }

    updatePreviewToolbar();
    restorePreviewAnchor(anchor);
  } catch (e) {
    if (stage) {
      stage.innerHTML = '<div class="preview-empty">' + esc('Preview failed: ' + e.message) + '</div>';
    }
  }
}

function zoomPreview(direction) {
  if (!activePreviewState.kind) return;
  zoomPreviewByFactor(direction > 0 ? 1.2 : (1 / 1.2));
}

function zoomPreviewByFactor(factor) {
  if (!activePreviewState.kind) return;
  const anchor = capturePreviewAnchor();
  const nextZoom = clampPreviewZoom(activePreviewState.zoom * factor);
  if (Math.abs(nextZoom - activePreviewState.zoom) < 0.001) return;

  activePreviewState.zoom = nextZoom;
  if (activePreviewState.kind === 'pdf') {
    void renderPdfPreview(anchor);
  } else {
    applyImagePreviewZoom(anchor);
  }
}

function zoomPreviewByWheel(deltaY) {
  if (!activePreviewState.kind) return;
  const safeDelta = Number(deltaY) || 0;
  if (safeDelta === 0) return;

  const factor = Math.exp(-safeDelta * 0.0015);
  zoomPreviewByFactor(factor);
}

function resetPreviewZoom() {
  if (!activePreviewState.kind) return;
  const anchor = capturePreviewAnchor();
  activePreviewState.zoom = activePreviewState.initialZoom || 1;
  if (activePreviewState.kind === 'pdf') {
    void renderPdfPreview(anchor);
  } else {
    applyImagePreviewZoom(anchor);
  }
}

function changePdfPage(delta) {
  if (activePreviewState.kind !== 'pdf' || !activePreviewState.pdfPageCount) return;
  const nextPage = Math.max(1, Math.min(activePreviewState.pdfPageCount, activePreviewState.pdfPage + delta));
  if (nextPage === activePreviewState.pdfPage) return;

  activePreviewState.pdfPage = nextPage;
  void renderPdfPreview();
  setTimeout(function() {
    const shell = document.getElementById('preview-pan-shell');
    if (shell) {
      shell.scrollTop = 0;
      shell.scrollLeft = 0;
    }
  }, 0);
}

function renderEditHighlight(content, ext) {
  if (!editHighlight) return;
  const lang = mapExt(ext);
  editHighlight.innerHTML = '<code class="language-' + lang + '">' + escCode(content || ' ') + '</code>';
  const block = editHighlight.querySelector('code');
  if (block) {
    try { hljs.highlightElement(block); } catch(e) {}
  }
  syncEditHighlightScroll();
}

function syncEditHighlightScroll() {
  if (!editTextarea || !editHighlight) return;
  editHighlight.scrollTop = editTextarea.scrollTop;
  editHighlight.scrollLeft = editTextarea.scrollLeft;
}

function mapExt(ext) {
  const m = {ts:'typescript',js:'javascript',jsx:'javascript',tsx:'typescript',py:'python',rs:'rust',go:'go',java:'java',c:'c',cpp:'cpp',h:'c',hpp:'cpp',cs:'csharp',rb:'ruby',php:'php',sh:'bash',bash:'bash',zsh:'bash',json:'json',yaml:'yaml',yml:'yaml',toml:'toml',md:'markdown',html:'html',htm:'html',css:'css',scss:'scss',less:'less',sql:'sql',xml:'xml',swift:'swift',kt:'kotlin',lua:'lua',r:'r',dart:'dart',vue:'xml',svelte:'xml'};
  return m[ext] || 'plaintext';
}

function isMarkdownFile(ext, filePath) {
  const normalized = String(ext || '').toLowerCase();
  if (normalized === 'md' || normalized === 'markdown') return true;
  return String(filePath || '').toLowerCase().endsWith('.md') || String(filePath || '').toLowerCase().endsWith('.markdown');
}

function isPythonFile(ext) {
  return String(ext || '').toLowerCase() === 'py';
}

function canEditActiveFile() {
  return !!activeFile && !activeFilePreview;
}

function resetEditorPane() {
  activeFile = null;
  activeFileContent = '';
  activeFileExt = '';
  activeFilePreview = null;
  activePythonInterpreter = null;
  resetPreviewState(null);
  isEditing = false;
  document.getElementById('editor-welcome').style.display = 'flex';
  document.getElementById('code-view').style.display = 'none';
  document.getElementById('preview-view').style.display = 'none';
  document.getElementById('edit-area').style.display = 'none';
  document.getElementById('editor-info').textContent = '—';
  updateEditorActions();
  updateActiveTreeSelection();
}

function setEditorInfo(filePath, ext, size) {
  const parts = [filePath];
  if (ext) parts.push(ext.toUpperCase());
  parts.push(formatSize(size || 0));
  if (activePythonInterpreter && isPythonFile(ext)) {
    parts.push('Python ' + activePythonInterpreter.version);
  }
  document.getElementById('editor-info').textContent = parts.join(' | ');
}

function updateEditorActions() {
  const actions = document.getElementById('editor-actions');
  const editBtn = document.getElementById('edit-toggle-btn');
  const saveBtn = document.getElementById('save-btn');
  const runBtn = document.getElementById('run-file-btn');

  if (!actions || !editBtn || !saveBtn || !runBtn) return;

  if (!activeFile) {
    actions.style.display = 'none';
    runBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    editBtn.style.display = 'none';
    editBtn.textContent = t('editor.edit');
    return;
  }

  editBtn.style.display = canEditActiveFile() ? 'inline-block' : 'none';
  editBtn.textContent = isEditing
    ? (isMarkdownFile(activeFileExt, activeFile) ? t('editor.preview') : t('editor.viewing'))
    : t('editor.edit');
  saveBtn.style.display = isEditing && canEditActiveFile() ? 'inline-block' : 'none';
  runBtn.style.display = !activeFilePreview && isPythonFile(activeFileExt) ? 'inline-block' : 'none';
  actions.style.display = (editBtn.style.display === 'none' && saveBtn.style.display === 'none' && runBtn.style.display === 'none')
    ? 'none'
    : 'flex';
}

function toggleEditMode() {
  if (!canEditActiveFile()) return;
  if (isEditing) {
    exitEditMode();
    renderActiveFileView(activeFileContent, activeFileExt);
  } else {
    isEditing = true;
    document.getElementById('code-view').style.display = 'none';
    document.getElementById('preview-view').style.display = 'none';
    document.getElementById('edit-area').style.display = 'block';
    editTextarea.value = activeFileContent;
    renderEditHighlight(activeFileContent, activeFileExt);
    editTextarea.focus();
    updateEditorActions();
  }
}

function exitEditMode() {
  isEditing = false;
  document.getElementById('edit-area').style.display = 'none';
  updateEditorActions();
  syncEditHighlightScroll();
}

async function saveFile(options = {}) {
  if (!activeFile) return;
  const content = editTextarea.value;
  try {
    const r = await (await fetch('/api/file',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:activeFile,content:content})})).json();
    if (r.success) {
      activeFileContent = content;
      updateActiveTabModified(false);
      if (!options.silent) {
        addMsg('system', (currentLang==='zh-CN'?'已保存: ':'Saved: ') + activeFile);
      }
      if (options.keepEditing) {
        renderEditHighlight(content, activeFileExt);
      } else {
        exitEditMode();
        renderActiveFileView(content, activeFileExt);
      }
      setEditorInfo(activeFile, activeFileExt, content.length);
      return true;
    } else {
      addMsg('system','Save error: '+(r.error||''));
    }
  } catch(e) { addMsg('system','Save failed: '+e.message); }
  return false;
}

async function refreshActivePythonInterpreter(filePath, ext, size) {
  const requestToken = ++activePythonInterpreterToken;
  try {
    const r = await (await fetch('/api/python/interpreter?path=' + encodeURIComponent(filePath))).json();
    if (requestToken !== activePythonInterpreterToken || activeFile !== filePath) return;
    activePythonInterpreter = r.success ? r.interpreter : null;
    setEditorInfo(filePath, ext, size);
  } catch (e) {
    if (requestToken !== activePythonInterpreterToken || activeFile !== filePath) return;
    activePythonInterpreter = null;
    setEditorInfo(filePath, ext, size);
  }
}

async function runActivePythonFile() {
  if (!activeFile || !isPythonFile(activeFileExt)) return;

  if (isEditing && editTextarea.value !== activeFileContent) {
    const saved = await saveFile({ keepEditing: true, silent: true });
    if (!saved) return;
  }

  try {
    const r = await (await fetch('/api/python/run', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({path:activeFile}),
    })).json();
    if (!r.success) {
      addMsg('system', 'Run failed: ' + (r.error || ''));
      return;
    }
    upsertTerminalSession(r.session, true);
    if (r.interpreter) {
      activePythonInterpreter = r.interpreter;
      setEditorInfo(activeFile, activeFileExt, activeFileContent.length);
      updateTerminalStatus(t('terminal.runningFile') + ': ' + activeFile + ' | ' + t('terminal.python') + ': ' + r.interpreter.path + ' (' + r.interpreter.version + ')');
    }
  } catch (e) {
    addMsg('system', 'Run failed: ' + e.message);
  }
}

// Tabs
function renderTabs() {
  const container = document.getElementById('editor-tabs');
  if (!container) return;
  container.innerHTML = '';
  for (const tab of openTabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.path === activeFile ? ' active' : '');
    
    // Create close button with proper event handling
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-tab';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeTab(tab.path);
    };
    
    el.innerHTML = esc(tab.name) + (tab.modified ? '<span class="modified">*</span>' : '');
    el.appendChild(closeBtn);
    el.onclick = () => openFile(tab.path, tab.name);
    container.appendChild(el);
  }
}

function updateActiveTabModified(isModified) {
  if (!activeFile) return;
  const tab = openTabs.find(t => t.path === activeFile);
  if (!tab || tab.modified === isModified) return;
  tab.modified = isModified;
  renderTabs();
}

function closeTab(filePath) {
  openTabs = openTabs.filter(t => t.path !== filePath);
  renderTabs();
  if (activeFile === filePath) {
    if (openTabs.length > 0) {
      void openFile(openTabs[openTabs.length-1].path, openTabs[openTabs.length-1].name);
    } else {
      resetEditorPane();
    }
  } else {
    updateEditorActions();
  }
}

// ==================== Pending Changes Review ====================
async function refreshPendingChanges() {
  try {
    const r = await (await fetch('/api/pending-changes')).json();
    pendingChanges = r.changes || [];

    if (pendingChanges.length === 0) {
      activePendingPath = null;
    } else if (!pendingChanges.find(change => change.path === activePendingPath)) {
      activePendingPath = pendingChanges[0].path;
    }

    renderPendingChanges();
  } catch (e) {
    console.error('Failed to load pending changes:', e);
  }
}

function renderPendingChanges() {
  const panel = document.getElementById('review-panel');
  const title = document.getElementById('review-title');
  const listEl = document.getElementById('review-list');
  const diffEl = document.getElementById('review-diff');

  if (!panel || !title || !listEl || !diffEl) return;

  if (!pendingChanges.length) {
    panel.style.display = 'none';
    listEl.innerHTML = '';
    diffEl.innerHTML = '<div class="review-empty">' + esc(t('review.empty')) + '</div>';
    return;
  }

  panel.style.display = 'flex';
  title.textContent = t('review.title') + ' (' + pendingChanges.length + ')';
  listEl.innerHTML = '';

  for (const change of pendingChanges) {
    const item = document.createElement('div');
    item.className = 'review-item' + (change.path === activePendingPath ? ' active' : '');
    item.onclick = () => {
      activePendingPath = change.path;
      renderPendingChanges();
    };

    const filePath = document.createElement('div');
    filePath.className = 'review-path';
    filePath.textContent = change.relativePath;
    item.appendChild(filePath);

    const meta = document.createElement('div');
    meta.className = 'review-meta';
    meta.innerHTML =
      '<span class="review-added">+' + change.addedLines + '</span>' +
      '<span class="review-removed">-' + change.removedLines + '</span>' +
      (change.existed ? '' : '<span class="review-created">' + esc(t('review.newFile')) + '</span>');
    item.appendChild(meta);
    listEl.appendChild(item);
  }

  const activeChange = pendingChanges.find(change => change.path === activePendingPath) || pendingChanges[0];
  if (activeChange) {
    renderPendingDiff(activeChange);
  }
}

function renderPendingDiff(change) {
  const diffEl = document.getElementById('review-diff');
  if (!diffEl) return;

  diffEl.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'review-diff-header';

  const title = document.createElement('div');
  title.className = 'review-diff-title';

  const pathEl = document.createElement('div');
  pathEl.className = 'review-diff-path';
  pathEl.textContent = change.relativePath;
  title.appendChild(pathEl);

  const note = document.createElement('div');
  note.className = 'review-diff-note';
  note.textContent =
    (change.existed ? '' : t('review.newFile') + ' · ') +
    t('review.waiting') +
    ' · +' + change.addedLines + ' / -' + change.removedLines;
  title.appendChild(note);

  const actions = document.createElement('div');
  actions.className = 'review-file-actions';

  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'primary';
  acceptBtn.textContent = t('review.accept');
  acceptBtn.onclick = () => acceptPendingChange(change.path);
  actions.appendChild(acceptBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'danger';
  rejectBtn.textContent = t('review.reject');
  rejectBtn.onclick = () => rejectPendingChange(change.path);
  actions.appendChild(rejectBtn);

  header.appendChild(title);
  header.appendChild(actions);
  diffEl.appendChild(header);

  const body = document.createElement('div');
  body.className = 'review-diff-body';

  if (!change.hunks || change.hunks.length === 0) {
    body.innerHTML = '<div class="review-empty">' + esc(t('review.empty')) + '</div>';
    diffEl.appendChild(body);
    return;
  }

  const table = document.createElement('table');
  table.className = 'diff-table';

  const colgroup = document.createElement('colgroup');
  ['diff-col-sign', 'diff-col-old', 'diff-col-new', 'diff-col-content'].forEach(className => {
    const col = document.createElement('col');
    col.className = className;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  for (const hunk of change.hunks) {
    const hunkRow = document.createElement('tr');
    hunkRow.className = 'diff-hunk';

    const hunkCell = document.createElement('td');
    hunkCell.colSpan = 4;
    hunkCell.textContent = '@@ -' + hunk.oldStart + ',' + hunk.oldCount + ' +' + hunk.newStart + ',' + hunk.newCount + ' @@';
    hunkRow.appendChild(hunkCell);
    table.appendChild(hunkRow);

    for (const line of hunk.lines) {
      const row = document.createElement('tr');
      row.className = 'diff-row ' + line.type;

      const sign = document.createElement('td');
      sign.className = 'diff-sign';
      sign.textContent = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      row.appendChild(sign);

      const oldLine = document.createElement('td');
      oldLine.className = 'diff-old';
      oldLine.textContent = line.oldLineNumber === null ? '' : String(line.oldLineNumber);
      row.appendChild(oldLine);

      const newLine = document.createElement('td');
      newLine.className = 'diff-new';
      newLine.textContent = line.newLineNumber === null ? '' : String(line.newLineNumber);
      row.appendChild(newLine);

      const content = document.createElement('td');
      content.className = 'diff-content';
      content.textContent = line.content || ' ';
      row.appendChild(content);

      table.appendChild(row);
    }
  }

  body.appendChild(table);
  diffEl.appendChild(body);
}

async function acceptPendingChange(filePath) {
  await updatePendingChanges('/api/pending-changes/accept', { path: filePath }, t('review.accepted'));
}

async function rejectPendingChange(filePath) {
  await updatePendingChanges('/api/pending-changes/reject', { path: filePath }, t('review.rejected'));
}

async function acceptAllPendingChanges() {
  await updatePendingChanges('/api/pending-changes/accept', {}, t('review.accepted'));
}

async function rejectAllPendingChanges() {
  await updatePendingChanges('/api/pending-changes/reject', {}, t('review.rejected'));
}

async function updatePendingChanges(url, payload, successLabel) {
  try {
    const r = await (await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).json();

    if (!r.success) {
      addMsg('system', 'Error: ' + (r.error || 'unknown'));
      return;
    }

    addMsg('system', successLabel);
    await refreshPendingChanges();
    loadFileTree('.');
    if (activeFile && !isEditing) {
      openFile(activeFile, activeFile.split(/[\\/]/).pop());
    }
  } catch (e) {
    addMsg('system', 'Error: ' + e.message);
  }
}

// ==================== Terminal ====================
function getTerminalTheme() {
  const styles = getComputedStyle(document.documentElement);
  const dark = document.documentElement.getAttribute('data-theme') !== 'light';
  const terminalBg = styles.getPropertyValue('--terminal-bg').trim() || (dark ? '#11131a' : '#ffffff');
  return {
    background: terminalBg,
    foreground: styles.getPropertyValue('--text').trim() || (dark ? '#c0caf5' : '#24292e'),
    cursor: styles.getPropertyValue('--accent').trim() || '#7aa2f7',
    selectionBackground: dark ? 'rgba(122,162,247,.28)' : 'rgba(9,105,218,.18)',
    black: dark ? '#15161f' : '#24292e',
    brightBlack: dark ? '#565f89' : '#57606a',
    red: styles.getPropertyValue('--red').trim() || '#cf222e',
    brightRed: '#ff7b72',
    green: styles.getPropertyValue('--green').trim() || '#1a7f37',
    brightGreen: '#3fb950',
    yellow: styles.getPropertyValue('--yellow').trim() || '#9a6700',
    brightYellow: '#d29922',
    blue: styles.getPropertyValue('--accent').trim() || '#0969da',
    brightBlue: '#58a6ff',
    magenta: '#bc8cff',
    brightMagenta: '#d2a8ff',
    cyan: '#39c5cf',
    brightCyan: '#56d4dd',
    white: dark ? '#c9d1d9' : '#24292e',
    brightWhite: dark ? '#f0f6fc' : '#57606a',
  };
}

function applyTerminalThemes() {
  const theme = getTerminalTheme();
  for (const view of terminalViews.values()) {
    if (view && view.terminal) {
      view.terminal.options.theme = theme;
      if (typeof view.terminal.refresh === 'function') {
        view.terminal.refresh(0, Math.max(0, (view.terminal.rows || 1) - 1));
      }
      if (view.fitAddon && view.fitAddon.fit) {
        view.fitAddon.fit();
      }
    }
  }
}

function getDisplayTerminalName(session) {
  if (!session) return '';

  const shellNames = new Set(['Shell', '终端']);
  if (session.kind === 'shell' && shellNames.has(session.name)) {
    return t('terminal.shell');
  }

  const pythonMatch = String(session.name || '').match(/^(.*)\s+•\s+Python$/);
  if (session.kind === 'python' && pythonMatch) {
    return pythonMatch[1] + ' • Python';
  }

  return session.name;
}

async function loadTerminalSessions() {
  try {
    const r = await (await fetch('/api/terminal/sessions')).json();
    terminalSessions = r.sessions || [];
    for (const session of terminalSessions) {
      ensureTerminalView(session);
    }
    if (!activeTerminalId || !terminalSessions.find(session => session.id === activeTerminalId)) {
      activeTerminalId = terminalSessions.length ? terminalSessions[terminalSessions.length - 1].id : null;
    }
    renderTerminalTabs();
    if (activeTerminalId) {
      setActiveTerminal(activeTerminalId);
    } else {
      updateTerminalStatus();
      await createTerminalSession();
    }
  } catch (e) {
    console.error('Failed to load terminal sessions:', e);
  }
}

async function createTerminalSession() {
  try {
    const r = await (await fetch('/api/terminal/create', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ name: t('terminal.shell') }),
    })).json();
    if (!r.success) {
      addMsg('system', 'Terminal error: ' + (r.error || ''));
      return;
    }
    upsertTerminalSession(r.session, true);
  } catch (e) {
    addMsg('system', 'Terminal error: ' + e.message);
  }
}

function upsertTerminalSession(session, makeActive) {
  const existingIndex = terminalSessions.findIndex(item => item.id === session.id);
  if (existingIndex === -1) terminalSessions.push(session);
  else terminalSessions[existingIndex] = session;

  ensureTerminalView(session);
  renderTerminalTabs();
  if (makeActive || !activeTerminalId) {
    setActiveTerminal(session.id);
  } else {
    updateTerminalStatus();
  }
}

function ensureTerminalView(session) {
  if (terminalViews.has(session.id)) return terminalViews.get(session.id);

  const viewsContainer = document.getElementById('terminal-views');
  if (!viewsContainer || !window.Terminal) return null;

  const container = document.createElement('div');
  container.className = 'terminal-view';
  container.dataset.sessionId = session.id;

  const host = document.createElement('div');
  host.className = 'terminal-host';
  container.appendChild(host);
  viewsContainer.appendChild(container);

  const terminal = new window.Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    scrollback: 5000,
    convertEol: false,
    theme: getTerminalTheme(),
  });
  const fitAddon = window.FitAddon && window.FitAddon.FitAddon ? new window.FitAddon.FitAddon() : null;
  if (fitAddon) terminal.loadAddon(fitAddon);
  terminal.open(host);
  if (fitAddon) fitAddon.fit();

  terminal.onData((data) => {
    void sendTerminalInput(session.id, data);
  });
  host.addEventListener('click', () => terminal.focus());

  const view = { sessionId: session.id, container, host, terminal, fitAddon };
  terminalViews.set(session.id, view);
  syncTerminalSize(session.id);
  return view;
}

async function sendTerminalInput(sessionId, data) {
  try {
    await fetch('/api/terminal/input', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sessionId, data }),
    });
  } catch (e) {
    console.error('Terminal input failed:', e);
  }
}

async function syncTerminalSize(sessionId) {
  const view = terminalViews.get(sessionId);
  if (!view || !view.terminal) return;

  const cols = view.terminal.cols || 80;
  const rows = view.terminal.rows || 24;

  try {
    await fetch('/api/terminal/resize', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sessionId, cols, rows }),
    });
  } catch (e) {
    console.error('Terminal resize failed:', e);
  }
}

function setActiveTerminal(sessionId) {
  activeTerminalId = sessionId;
  const empty = document.getElementById('terminal-empty');
  if (empty) empty.style.display = terminalSessions.length ? 'none' : 'flex';

  for (const session of terminalSessions) {
    const view = terminalViews.get(session.id);
    if (!view) continue;
    view.container.classList.toggle('active', session.id === sessionId);
  }
  renderTerminalTabs();
  updateTerminalStatus();

  const activeView = terminalViews.get(sessionId);
  if (activeView) {
    setTimeout(() => {
      if (activeView.fitAddon && activeView.fitAddon.fit) activeView.fitAddon.fit();
      void syncTerminalSize(sessionId);
      activeView.terminal.focus();
    }, 0);
  }
}

function renderTerminalTabs() {
  const tabs = document.getElementById('terminal-tabs');
  const empty = document.getElementById('terminal-empty');
  if (!tabs || !empty) return;

  tabs.innerHTML = '';
  empty.style.display = terminalSessions.length ? 'none' : 'flex';

  for (const session of terminalSessions) {
    const tab = document.createElement('div');
    const isActive = session.id === activeTerminalId;
    tab.className = 'terminal-tab ' + (session.running ? 'running' : 'exited') + (isActive ? ' active' : '');
    tab.onclick = () => setActiveTerminal(session.id);

    const state = document.createElement('span');
    state.className = 'terminal-tab-state';
    tab.appendChild(state);

    const label = document.createElement('span');
    label.className = 'terminal-tab-name';
    label.textContent = getDisplayTerminalName(session);
    tab.appendChild(label);

    const close = document.createElement('span');
    close.className = 'terminal-tab-close';
    close.textContent = '×';
    close.onclick = async (event) => {
      event.stopPropagation();
      await closeTerminalSession(session.id);
    };
    tab.appendChild(close);

    tabs.appendChild(tab);
  }
}

async function closeTerminalSession(sessionId) {
  try {
    await fetch('/api/terminal/close', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ sessionId }),
    });
  } catch (e) {
    console.error('Failed to close terminal:', e);
  }

  const view = terminalViews.get(sessionId);
  if (view) {
    view.terminal.dispose();
    view.container.remove();
    terminalViews.delete(sessionId);
  }

  terminalSessions = terminalSessions.filter(session => session.id !== sessionId);
  if (activeTerminalId === sessionId) {
    activeTerminalId = terminalSessions.length ? terminalSessions[terminalSessions.length - 1].id : null;
  }

  renderTerminalTabs();
  if (activeTerminalId) {
    setActiveTerminal(activeTerminalId);
  } else {
    updateTerminalStatus();
  }
}

function handleTerminalOutput(sessionId, chunk) {
  const session = terminalSessions.find(item => item.id === sessionId);
  if (session) ensureTerminalView(session);
  const view = terminalViews.get(sessionId);
  if (!view) return;
  view.terminal.write(String(chunk || ''));
}

function handleTerminalExit(sessionId, exitCode, signal) {
  const session = terminalSessions.find(item => item.id === sessionId);
  if (!session) return;
  session.running = false;
  session.exitCode = exitCode;
  session.exitSignal = signal;

  const view = terminalViews.get(sessionId);
  if (view) {
    const parts = [];
    if (exitCode !== null && exitCode !== undefined) parts.push('exit ' + exitCode);
    if (signal) parts.push(signal);
    const suffix = parts.length ? parts.join(', ') : 'done';
    view.terminal.write('\r\n[' + t('terminal.exited') + ': ' + suffix + ']\r\n');
  }

  renderTerminalTabs();
  updateTerminalStatus();
}

function updateTerminalStatus(overrideText) {
  const status = document.getElementById('terminal-status');
  if (!status) return;

  if (overrideText) {
    status.textContent = overrideText;
    return;
  }

  const session = terminalSessions.find(item => item.id === activeTerminalId);
  if (!session) {
    status.textContent = t('terminal.empty');
    return;
  }

  status.textContent = getDisplayTerminalName(session) + ' • ' + (session.running ? t('terminal.running') : t('terminal.exited'));
}

function getSubtaskStatusLabel(task) {
  if (!task) return '';
  if (task.status === 'timed_out') return t('subtask.timedOut');
  if (task.status === 'stopping') return t('subtask.stopping');
  if (task.status === 'exited') return t('subtask.exited');
  return t('subtask.running');
}

function formatSubtaskCountText(tasks) {
  const allTasks = Array.isArray(tasks) ? tasks : [];
  const runningCount = allTasks.filter(task => task && task.running).length;
  if (currentLang === 'zh-CN') {
    return '总计 ' + allTasks.length + ' / 运行中 ' + runningCount;
  }
  return runningCount + ' running / ' + allTasks.length;
}

function normalizeSubtaskList(tasks) {
  return (Array.isArray(tasks) ? tasks.slice() : [])
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function renderSubtasks() {
  const list = document.getElementById('subtask-list');
  const empty = document.getElementById('subtask-empty');
  const count = document.getElementById('subtask-count');
  if (!list || !empty || !count) return;

  const tasks = normalizeSubtaskList(backgroundSubtasks);
  count.textContent = formatSubtaskCountText(tasks);

  if (tasks.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
    list.innerHTML = '';
    return;
  }

  empty.style.display = 'none';
  list.style.display = 'flex';
  list.innerHTML = tasks.map(function(task) {
    const stateClass = task.status === 'timed_out'
      ? ' timed-out'
      : (task.status === 'stopping' ? ' stopping' : (task.running ? ' running' : ''));
    const exitText = task.running
      ? ''
      : (task.timedOut
        ? t('subtask.timedOut')
        : (task.exitCode !== null && task.exitCode !== undefined ? ('exit ' + task.exitCode) : (task.exitSignal || t('subtask.exited'))));
    const metaParts = [
      task.cwd || '',
      t('subtask.timeout') + ' ' + Math.round((Number(task.timeoutMs) || 0) / 1000) + 's',
      exitText,
    ].filter(Boolean);

    return '<div class="subtask-item' + stateClass + '">' +
      '<div class="subtask-head">' +
        '<div class="subtask-name">' + esc(task.name || task.command || task.id) + '</div>' +
        '<div class="subtask-status">' + esc(getSubtaskStatusLabel(task)) + '</div>' +
      '</div>' +
      '<div class="subtask-meta">' + esc(metaParts.join(' • ')) + '</div>' +
      (task.outputPreview ? ('<div class="subtask-preview">' + esc(task.outputPreview) + '</div>') : '') +
      (task.running ? ('<div class="subtask-actions"><button class="subtask-stop" onclick="stopSubtask(\'' + escJs(task.id) + '\')">' + esc(t('subtask.stop')) + '</button></div>') : '') +
    '</div>';
  }).join('');
}

async function loadSubtasks() {
  try {
    const r = await (await fetch('/api/subtasks')).json();
    backgroundSubtasks = Array.isArray(r.tasks) ? r.tasks : [];
    renderSubtasks();
  } catch (e) {
    console.error('Failed to load background subtasks:', e);
  }
}

function upsertSubtask(task) {
  if (!task || !task.id) return;
  const next = Object.assign({}, task);
  const index = backgroundSubtasks.findIndex(function(item) {
    return item.id === next.id;
  });
  if (index === -1) backgroundSubtasks.push(next);
  else backgroundSubtasks[index] = next;
  renderSubtasks();
}

function handleSubtaskOutput(taskId, preview) {
  const task = backgroundSubtasks.find(function(item) {
    return item.id === taskId;
  });
  if (!task) return;
  task.outputPreview = String(preview || '');
  task.lastOutputAt = Date.now();
  renderSubtasks();
}

async function stopSubtask(taskId) {
  try {
    const r = await (await fetch('/api/subtasks/stop', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ taskId }),
    })).json();
    if (!r.success) {
      addMsg('system', 'Subtask error: ' + (r.error || ''));
    }
  } catch (e) {
    addMsg('system', 'Subtask error: ' + e.message);
  }
}

// ==================== Chat Context Files ====================
function renderContextFiles() {
  const container = document.getElementById('chat-context-files');
  if (!container) return;

  if (attachedContextFiles.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  for (const file of attachedContextFiles) {
    const chip = document.createElement('div');
    chip.className = 'context-chip';

    const label = document.createElement('span');
    label.className = 'chip-label';
    label.textContent = '@' + formatMentionDisplayPath(file);
    chip.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = 'Remove';
    remove.onclick = () => {
      attachedContextFiles = attachedContextFiles.filter(item => item.path !== file.path);
      renderContextFiles();
    };
    chip.appendChild(remove);

    container.appendChild(chip);
  }
}

function addContextFile(file) {
  if (attachedContextFiles.find(item => item.path === file.path)) {
    hideMentionMenu();
    return;
  }

  attachedContextFiles.push(file);
  renderContextFiles();
  hideMentionMenu();
}

function getMentionState() {
  const caret = chatInput.selectionStart ?? 0;
  const beforeCaret = chatInput.value.slice(0, caret);
  for (let atIndex = beforeCaret.length - 1; atIndex >= 0; atIndex--) {
    if (beforeCaret[atIndex] !== '@') continue;

    const prevChar = beforeCaret[atIndex - 1] || '';
    // Ignore email-like tokens such as foo@bar.com, but allow Chinese text and punctuation before @.
    if (prevChar && /[A-Za-z0-9._%+-]/.test(prevChar)) {
      continue;
    }

    const query = beforeCaret.slice(atIndex + 1);
    if (/[\s]/.test(query)) return null;

    return {
      query,
      start: atIndex,
      end: caret,
    };
  }

  return null;
}

function scheduleMentionSearch() {
  if (mentionSearchTimer) clearTimeout(mentionSearchTimer);
  mentionSearchTimer = setTimeout(updateMentionMenu, 120);
}

async function updateMentionMenu() {
  const nextSession = getMentionState();
  if (!nextSession) {
    hideMentionMenu();
    return;
  }

  mentionSession = nextSession;
  const requestToken = ++mentionSearchToken;
  const cacheKey = nextSession.query.toLowerCase();
  const localFiles = findLocalMentionResults(nextSession.query, nextSession.query.trim() ? 400 : Math.max(treeFileIndex.length, 400));

  mentionResults = localFiles;
  mentionActiveIndex = 0;
  renderMentionMenu();

  if (!shouldFetchRemoteMentionResults(nextSession.query, localFiles.length)) {
    return;
  }

  try {
    const files = mergeMentionResults(localFiles, await loadMentionResults(cacheKey, nextSession.query), nextSession.query.trim() ? 400 : 8000);
    if (requestToken !== mentionSearchToken) return;

    mentionResults = files;
    mentionActiveIndex = 0;
    renderMentionMenu();
  } catch (e) {
    console.error('Mention search failed:', e);
    hideMentionMenu();
  }
}

function shouldFetchRemoteMentionResults(query, localCount) {
  if (query.trim().length === 0) {
    return localCount === 0;
  }
  return localCount < 400;
}

function findLocalMentionResults(query, limit) {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  return treeFileIndex
    .filter(file => !normalizedQuery || file.path.toLowerCase().includes(normalizedQuery) || file.name.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map(file => ({ path: file.path, name: file.name, type: file.type }));
}

function mergeMentionResults(primary, secondary, limit) {
  const merged = [];
  const seen = new Set();

  for (const file of [...primary, ...secondary]) {
    if (!file || !file.path || seen.has(file.path)) continue;
    seen.add(file.path);
    merged.push(file);
  }

  return merged
    .sort(function(a, b) {
      return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' });
    })
    .slice(0, limit);
}

async function loadMentionResults(cacheKey, query) {
  if (mentionQueryCache.has(cacheKey)) {
    return mentionQueryCache.get(cacheKey);
  }

  if (!mentionRequestCache.has(cacheKey)) {
    const request = (async () => {
      const limit = query.trim() ? 400 : 8000;
      const r = await (await fetch('/api/files/search?q=' + encodeURIComponent(query) + '&limit=' + limit)).json();
      const files = r.files || [];
      mentionQueryCache.set(cacheKey, files);
      if (mentionQueryCache.size > 20) {
        const firstKey = mentionQueryCache.keys().next().value;
        if (firstKey !== undefined) mentionQueryCache.delete(firstKey);
      }
      mentionRequestCache.delete(cacheKey);
      return files;
    })().catch((error) => {
      mentionRequestCache.delete(cacheKey);
      throw error;
    });
    mentionRequestCache.set(cacheKey, request);
  }

  return await mentionRequestCache.get(cacheKey);
}

function renderMentionMenu() {
  const menu = document.getElementById('mention-menu');
  if (!menu || !mentionSession) return;

  menu.innerHTML = '';
  menu.style.display = 'flex';

  if (mentionResults.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'mention-item';
    empty.innerHTML =
      '<span class="mention-name">' + esc(t('chat.noMatches')) + '</span>' +
      '<span class="mention-path">@' + esc(mentionSession.query) + '</span>';
    menu.appendChild(empty);
    return;
  }

  mentionResults.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'mention-item' + (index === mentionActiveIndex ? ' active' : '');
    item.onmousedown = (event) => {
      event.preventDefault();
      selectMention(index);
    };
    item.innerHTML =
      '<span class="mention-name">' + esc(formatMentionDisplayName(file)) + '</span>' +
      '<span class="mention-path">' + esc(formatMentionDisplayPath(file)) + '</span>';
    menu.appendChild(item);
  });
}

function hideMentionMenu() {
  mentionSession = null;
  mentionResults = [];
  mentionActiveIndex = 0;
  const menu = document.getElementById('mention-menu');
  if (menu) {
    menu.style.display = 'none';
    menu.innerHTML = '';
  }
}

function moveMentionSelection(direction) {
  if (!mentionResults.length) return;
  mentionActiveIndex = (mentionActiveIndex + direction + mentionResults.length) % mentionResults.length;
  renderMentionMenu();
}

function selectMention(index = mentionActiveIndex) {
  const file = mentionResults[index];
  if (!file || !mentionSession) return;

  const before = chatInput.value.slice(0, mentionSession.start);
  const after = chatInput.value.slice(chatInput.selectionStart ?? mentionSession.end);
  chatInput.value = before + after;
  chatInput.focus();
  chatInput.selectionStart = chatInput.selectionEnd = before.length;
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';

  addContextFile(file);
}

function formatUserMessageDisplay(text, files, images) {
  images = images || [];
  const parts = [];

  if (text) parts.push(text);

  if (images.length > 0) {
    if (parts.length > 0) parts.push('');
    const imgCount = images.length;
    parts.push(currentLang === 'zh-CN'
      ? ('📷 已附加 ' + imgCount + ' 张图片：')
      : ('📷 ' + imgCount + ' image' + (imgCount > 1 ? 's' : '') + ' attached:'));
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      parts.push('![' + img.filename + '](' + img.base64 + ')');
    }
  }

  if (files.length > 0) {
    if (parts.length > 0) parts.push('');
    parts.push(t('chat.contextAttached') + ':');
    for (let i = 0; i < files.length; i++) {
      parts.push('@' + formatMentionDisplayPath(files[i]));
    }
  }

  return parts.join('\n');
}

// ==================== Chat ====================
let messagesEl, chatInput, sendBtn, cancelBtn, statusEl;
const MAX_CHAT_IMAGES = 5;
let isCancellingRequest = false;

document.addEventListener('DOMContentLoaded', function() {
  messagesEl = document.getElementById('messages');
  chatInput = document.getElementById('chat-input');
  sendBtn = document.getElementById('send-btn');
  cancelBtn = document.getElementById('cancel-btn');
  statusEl = document.getElementById('status');

  chatInput.addEventListener('input', () => {
    chatInput.style.height='auto';
    chatInput.style.height=Math.min(chatInput.scrollHeight,160)+'px';
    scheduleMentionSearch();
  });
  chatInput.addEventListener('click', () => scheduleMentionSearch());
  chatInput.addEventListener('keyup', (e) => {
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) scheduleMentionSearch();
  });
  chatInput.addEventListener('paste', (event) => {
    void handleImagePaste(event);
  });
  chatInput.addEventListener('keydown', (e) => {
    if (mentionSession && document.getElementById('mention-menu').style.display === 'flex') {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveMentionSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveMentionSelection(-1); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) { e.preventDefault(); selectMention(); return; }
      if (e.key === 'Escape') { e.preventDefault(); hideMentionMenu(); return; }
    }
    if (e.key==='Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
  document.addEventListener('click', (event) => {
    const target = event.target;
    const copyButton = target && typeof target.closest === 'function' ? target.closest('.copy-code-btn') : null;
    if (copyButton) {
      event.preventDefault();
      void copyCodeBlock(copyButton);
      return;
    }
    const chatArea = document.getElementById('chat-input-area');
    if (chatArea && !chatArea.contains(event.target)) hideMentionMenu();
  });
  updateChatComposerState();
  renderImagePreviews();
});

function updateChatComposerState() {
  if (sendBtn) sendBtn.disabled = isProcessing;
  if (chatInput) chatInput.disabled = isProcessing;
  if (cancelBtn) {
    cancelBtn.style.display = isProcessing ? 'inline-flex' : 'none';
    cancelBtn.disabled = !isProcessing || isCancellingRequest;
  }
  updateImageAttachmentControls();
}

function resetConversationUi() {
  if (messagesEl) messagesEl.innerHTML = '';

  currentAssistantEl = null;
  currentContentEl = null;
  currentReasoningEl = null;
  currentReasoningPreEl = null;
  currentReasoningSummaryEl = null;
  attachedContextFiles = [];
  attachedImages = [];

  renderContextFiles();
  renderImagePreviews();
  hideMentionMenu();

  if (chatInput) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
}

function restoreConversationFromMessages(messages) {
  resetConversationUi();

  for (const message of messages || []) {
    if (!message || message.role === 'tool') continue;

    const text = flattenRestoredMessageContent(message.content);
    if (!text) continue;

    if (message.role === 'user') {
      addMsg('user', text);
    } else if (message.role === 'assistant') {
      addMsg('assistant', text);
    }
  }
}

function flattenRestoredMessageContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(function(item) {
    if (item.type === 'text') return item.text;
    if (item.type === 'image_url') return '[image]';
    return '';
  }).filter(Boolean).join('\n');
}

function formatMentionDisplayName(file) {
  if (!file) return '';
  return file.type === 'directory' ? (file.name + '/') : file.name;
}

function formatMentionDisplayPath(file) {
  if (!file) return '';
  return file.type === 'directory' ? (file.path.replace(/\/+$/, '') + '/') : file.path;
}

async function waitForProcessingToStop(timeoutMs) {
  const startedAt = Date.now();
  while (isProcessing && Date.now() - startedAt < timeoutMs) {
    await new Promise(function(resolve) {
      setTimeout(resolve, 50);
    });
  }
  return !isProcessing;
}

function connectSSE() {
  const es = new EventSource('/api/stream');
  es.onopen = () => { statusEl.textContent='OK'; statusEl.style.color='var(--green)'; };
  es.onmessage = (ev) => handleEvent(JSON.parse(ev.data));
  es.onerror = () => { statusEl.textContent='Disconnected'; statusEl.style.color='var(--red)'; };
}

function handleEvent(event) {
  switch(event.type) {
    case 'connected':
      if (event.data) {
        activeProvider = event.data.provider||'';
        providerList = event.data.providers||[];
        renderProviders();
        if (event.data.workingDir) {
          applyWorkingDirectory({ workingDir: event.data.workingDir });
        }
        refreshPendingChanges();
        loadTerminalSessions();
        loadSubtasks();
        if (event.data.savedSessionAvailable && messagesEl && !messagesEl.childElementCount) {
          addMsg('system', t('chat.resumeHint'));
        }
        if (event.data.permissionMode) {
          syncPermissionModeFromSettings(event.data.permissionMode);
        }
        showOllamaReasoning = event.data.showOllamaReasoning === true;
      }
      break;
    case 'reasoning':
      if (event.data && typeof event.data.text === 'string' && event.data.text) {
        lastReasoningText += event.data.text;
        appendReasoningContent(event.data.text);
      }
      break;
    case 'content':
      if (!currentAssistantEl) { currentAssistantEl = addMsg('assistant','', { streaming: true }); currentContentEl = currentAssistantEl.querySelector('.body'); currentContentEl.classList.add('streaming-cursor'); }
      appendAssistantContent(currentContentEl, event.data.text);
      scrollChat();
      break;
    case 'tool_start': {
      const el = document.createElement('div'); el.className='tool-call';
      el.innerHTML='<span class="tool-name">'+esc(event.data.name)+'</span><span class="tool-args">'+esc(fmtArgs(event.data.name,event.data.args))+'</span>';
      messagesEl.appendChild(el); scrollChat(); break;
    }
    case 'tool_end': {
      const tc = document.querySelectorAll('.tool-call');
      const last = tc[tc.length-1];
      if (last) {
        const r = document.createElement('div');
        r.className='tool-result '+(event.data.success?'success':'failure');
        const out = event.data.output||'';
        const lines = out.split('\n');
        r.textContent = lines.length>8 ? lines.slice(0,8).join('\n')+'\n...(+'+(lines.length-8)+')' : out;
        last.appendChild(r);
      }
      scrollChat(); break;
    }
    case 'usage': {
      lastUsageData = event.data;
      break;
    }
    case 'provider_changed': activeProvider=event.data.provider; renderProviders(); break;
    case 'folder_changed': applyWorkingDirectory(event.data); break;
    case 'terminal_output': handleTerminalOutput(event.data.sessionId, event.data.chunk); break;
    case 'terminal_exit': handleTerminalExit(event.data.sessionId, event.data.exitCode, event.data.signal); break;
    case 'subtask_updated': upsertSubtask(event.data.task); break;
    case 'subtask_output': handleSubtaskOutput(event.data.taskId, event.data.preview); break;
    case 'system': addMsg('system', formatBackendSystemMessage(event.data.message)); scrollChat(); break;
    case 'error': addMsg('system', formatBackendErrorMessage(event.data.error)); finishResp(); addResponseSummary(); break;
    case 'done': finishResp(); addResponseSummary(); break;
    case 'pending_changes_updated': refreshPendingChanges(); break;
    case 'ollama_pull_progress':
    case 'ollama_pull_done':
      handleOllamaSSE(event); break;
  }
}

function finishResp() {
  finalizeReasoningMessage();
  if (currentContentEl) {
    currentContentEl.classList.remove('streaming-cursor');
    finalizeAssistantMessage(currentContentEl);
  }
  currentAssistantEl=null; currentContentEl=null;
  currentReasoningEl=null; currentReasoningPreEl=null; currentReasoningSummaryEl=null;
  isProcessing=false; isCancellingRequest=false; updateChatComposerState(); chatInput.focus();
  // Reload file tree in case tools modified files
  loadFileTree('.');
  refreshPendingChanges();
}

function formatBackendSystemMessage(message) {
  const value = String(message || '');
  if (!value) return '';
  if (value.startsWith('OLLAMA_WAITING::')) {
    const parts = value.split('::');
    const model = parts[1] || 'Ollama';
    return currentLang === 'zh-CN'
      ? (model + ' 已收到请求，正在本地开始推理。此阶段可能暂时没有可见输出，风扇变响通常表示本地 CPU/GPU 正在工作。')
      : (model + ' has received the request and is starting local inference. It is normal to see no visible output yet while the local CPU/GPU ramps up.');
  }
  if (value.startsWith('OLLAMA_THINKING::')) {
    const parts = value.split('::');
    const model = parts[1] || 'Ollama';
    return currentLang === 'zh-CN'
      ? (model + ' 正在本地思考，已收到推理流，正在等待它给出可见回复或工具调用。')
      : (model + ' is thinking locally. Reasoning activity has started, and the app is waiting for visible text or a tool call.');
  }
  if (value.startsWith('OLLAMA_CHAT_ONLY::')) {
    const model = value.slice('OLLAMA_CHAT_ONLY::'.length) || 'Ollama';
    return currentLang === 'zh-CN'
      ? ('当前 Ollama 模型不支持工具调用，已切换为仅聊天模式：' + model + '。如需读写文件和执行命令，请在设置中选择支持 tools 的本地模型。')
      : ('The current Ollama model does not support tool calling. Using chat-only mode: ' + model + '. Choose a tools-capable local model in Settings for file edits and commands.');
  }
  if (value.startsWith('OLLAMA_TOOL_RETRY::')) {
    const parts = value.split('::');
    const model = parts[1] || 'Ollama';
    const mode = parts[2] || 'compat';
    if (currentLang === 'zh-CN') {
      if (mode === 'shell') {
        return model + ' 在当前工具配置下返回空响应，正在切换到仅 shell 的兼容模式重试。';
      }
      if (mode === 'reduced') {
        return model + ' 在当前工具配置下返回空响应，正在切换到更小的兼容工具集重试。';
      }
      return model + ' 正在使用兼容工具模式。';
    }
    if (mode === 'shell') {
      return model + ' returned an empty tool response. Retrying with shell-only compatibility mode.';
    }
    if (mode === 'reduced') {
      return model + ' returned an empty tool response. Retrying with a smaller compatibility tool set.';
    }
    return model + ' is using compatibility tool mode.';
  }
  if (value === 'CHAT_CANCELLED') {
    return currentLang === 'zh-CN'
      ? '已取消本次会话。'
      : 'The current turn was cancelled.';
  }
  return value;
}

function formatBackendErrorMessage(error) {
  const value = String(error || '');
  if (!value) return 'Error';
  if (value.startsWith('OLLAMA_MODEL_NO_CHAT_SUPPORT::')) {
    const model = value.slice('OLLAMA_MODEL_NO_CHAT_SUPPORT::'.length) || 'Ollama';
    return currentLang === 'zh-CN'
      ? ('当前 Ollama 模型无法用于聊天：' + model + '。它更像是 embedding-only 模型，请在设置中选择支持 completion 的模型。')
      : ('The current Ollama model cannot be used for chat: ' + model + '. It appears to be an embedding-only model. Choose a completion-capable model in Settings.');
  }
  if (value.startsWith('OLLAMA_EMPTY_RESPONSE::')) {
    const model = value.slice('OLLAMA_EMPTY_RESPONSE::'.length) || 'Ollama';
    return currentLang === 'zh-CN'
      ? ('当前 Ollama 模型返回了空响应，没有正文也没有工具调用：' + model + '。这通常是该模型的工具调用兼容性问题，请重试或切换本地模型。')
      : ('The current Ollama model returned an empty response with no content and no tool calls: ' + model + '. This is usually a tool-calling compatibility issue. Retry or switch to a different local model.');
  }
  if (/does not support image input|does not support.*vision|does not support.*multimodal|image.*input.*not support|vision.*input.*not support/i.test(value)) {
    return currentLang === 'zh-CN'
      ? '当前模型不支持图片输入，请切换到支持视觉能力的模型。'
      : 'The current model does not support image input. Please switch to a vision-capable model.';
  }
  return 'Error: ' + value;
}

// ==================== Image Upload ====================
var attachedImages = [];

function getImageHintText() {
  return currentLang === 'zh-CN'
    ? '可上传或粘贴图片，最多 5 张'
    : 'Upload or paste images, up to 5';
}

function getImageCountText() {
  return currentLang === 'zh-CN'
    ? ('已附加 ' + attachedImages.length + '/' + MAX_CHAT_IMAGES + ' 张图片')
    : (attachedImages.length + '/' + MAX_CHAT_IMAGES + ' images attached');
}

function getImageLimitReachedText() {
  return currentLang === 'zh-CN'
    ? '最多只能附加 5 张图片'
    : 'You can attach up to 5 images';
}

function setImageStatus(message, tone) {
  const status = document.getElementById('chat-images-status');
  if (!status) return;

  status.className = tone === 'warn' ? 'warn' : '';
  status.textContent = message || (attachedImages.length > 0 ? getImageCountText() : getImageHintText());
}

function updateImageAttachmentControls() {
  const uploadBtn = document.getElementById('upload-img-btn');
  const uploadInput = document.getElementById('image-upload-input');
  const disabled = isProcessing || attachedImages.length >= MAX_CHAT_IMAGES;
  const title = attachedImages.length >= MAX_CHAT_IMAGES ? getImageLimitReachedText() : t('chat.uploadImage');

  if (uploadBtn) {
    uploadBtn.disabled = disabled;
    uploadBtn.title = title;
  }
  if (uploadInput) uploadInput.disabled = disabled;
}

function normalizeAttachedImageFilename(file, index) {
  const rawName = String((file && file.name) || '').trim();
  if (rawName) return rawName;

  const mime = String((file && file.type) || 'image/png');
  const ext = (mime.split('/')[1] || 'png').replace(/[^a-z0-9]+/gi, '').toLowerCase() || 'png';
  return 'pasted-image-' + Date.now() + '-' + (index + 1) + '.' + ext;
}

function readImageFileAsDataUrl(file, index) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const result = event && event.target ? event.target.result : '';
      resolve({
        base64: String(result || ''),
        filename: normalizeAttachedImageFilename(file, index),
      });
    };
    reader.onerror = function() {
      reject(new Error('Failed to read image file'));
    };
    reader.readAsDataURL(file);
  });
}

async function addAttachedImages(files) {
  const incoming = Array.from(files || []).filter(function(file) {
    return file && String(file.type || '').startsWith('image/');
  });

  if (incoming.length === 0) {
    setImageStatus('', '');
    return 0;
  }

  const remaining = Math.max(0, MAX_CHAT_IMAGES - attachedImages.length);
  if (remaining === 0) {
    setImageStatus(getImageLimitReachedText(), 'warn');
    return 0;
  }

  const accepted = incoming.slice(0, remaining);
  const loaded = await Promise.all(accepted.map(function(file, index) {
    return readImageFileAsDataUrl(file, attachedImages.length + index).catch(function() {
      return null;
    });
  }));

  attachedImages = attachedImages.concat(
    loaded.filter(function(image) {
      return image && String(image.base64 || '').startsWith('data:image/');
    }),
  );

  renderImagePreviews(
    incoming.length > accepted.length ? getImageLimitReachedText() : '',
    incoming.length > accepted.length ? 'warn' : '',
  );
  return accepted.length;
}

function triggerImageUpload() {
  if (isProcessing) return;
  if (attachedImages.length >= MAX_CHAT_IMAGES) {
    setImageStatus(getImageLimitReachedText(), 'warn');
    return;
  }
  const input = document.getElementById('image-upload-input');
  if (input) input.click();
}

async function handleImageUpload(event) {
  const input = event.target;
  const files = input.files;
  if (!files) return;
  await addAttachedImages(files);

  input.value = '';
}

async function handleImagePaste(event) {
  const clipboardData = event.clipboardData;
  if (!clipboardData || !clipboardData.items) return;

  const files = Array.from(clipboardData.items)
    .map(function(item) {
      return item && item.kind === 'file' ? item.getAsFile() : null;
    })
    .filter(function(file) {
      return file && String(file.type || '').startsWith('image/');
    });

  if (files.length === 0) return;

  event.preventDefault();
  await addAttachedImages(files);
}

function renderImagePreviews(statusMessage, statusTone) {
  const container = document.getElementById('chat-images-container');
  if (!container) return;

  if (attachedImages.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    setImageStatus(statusMessage, statusTone);
    updateImageAttachmentControls();
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = attachedImages.map(function(img, idx) {
    return '<div class="chat-image-preview">' +
      '<img src="' + escAttr(img.base64) + '" alt="' + escAttr(img.filename) + '" />' +
      '<button class="remove-img" onclick="removeImage(' + idx + ')">&times;</button>' +
      '</div>';
  }).join('');
  setImageStatus(statusMessage, statusTone);
  updateImageAttachmentControls();
}

function removeImage(index) {
  if (isProcessing) return;
  attachedImages.splice(index, 1);
  renderImagePreviews();
}

async function sendMessage() {
  const text = chatInput.value.trim();
  const contextFiles = attachedContextFiles.slice();
  const images = attachedImages.slice();
  if ((!text && contextFiles.length === 0 && images.length === 0) || isProcessing) return;
  if (text.startsWith('/') && contextFiles.length === 0 && images.length === 0) {
    chatInput.value = '';
    chatInput.style.height = 'auto';
    try {
      await executeCommand(text);
    } catch (e) {
      chatInput.value = text;
      addMsg('system', 'Failed: ' + e.message);
    }
    return;
  }
  isProcessing=true; isCancellingRequest=false; updateChatComposerState();
  addMsg('user', formatUserMessageDisplay(text, contextFiles, images));
  chatInput.value=''; chatInput.style.height='auto';
  attachedContextFiles = [];
  attachedImages = [];
  renderContextFiles();
  renderImagePreviews();
  hideMentionMenu();
  try {
    const resp = await fetch('/api/chat',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        message: text,
        contextFiles: contextFiles.map(function(file) { return file.path; }),
        images: images.map(function(img) { return { base64: img.base64, filename: img.filename }; }),
        permissionMode: currentPermissionMode,
      }),
    });
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok || data.error) {
      throw new Error(data.error || ('HTTP ' + resp.status));
    }
  }
  catch(e) {
    chatInput.value = text;
    chatInput.style.height='auto';
    chatInput.style.height=Math.min(chatInput.scrollHeight,160)+'px';
    attachedContextFiles = contextFiles;
    attachedImages = images;
    renderContextFiles();
    renderImagePreviews();
    addMsg('system','Failed: '+e.message);
    isProcessing=false; isCancellingRequest=false; updateChatComposerState();
    chatInput.focus();
  }
}

async function cancelCurrentRequest() {
  if (!isProcessing || isCancellingRequest) return;

  isCancellingRequest = true;
  updateChatComposerState();

  try {
    const resp = await fetch('/api/chat/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await resp.json().catch(function() { return {}; });
    if (!resp.ok || data.success === false && data.active !== false) {
      throw new Error(data.error || ('HTTP ' + resp.status));
    }
  } catch (e) {
    isCancellingRequest = false;
    updateChatComposerState();
    addMsg('system', 'Failed: ' + e.message);
  }
}

async function executeCommand(cmd, options) {
  const settings = options || {};
  const resp = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: cmd }),
  });
  const data = await resp.json().catch(function() { return {}; });
  if (!resp.ok || data.error) {
    throw new Error(data.error || ('HTTP ' + resp.status));
  }

  if (cmd === '/clear') {
    resetConversationUi();
  } else if (Array.isArray(data.messages)) {
    restoreConversationFromMessages(data.messages);
  } else if (data.result && !settings.silentResult) {
    addMsg('system', data.result);
  }

  if (Array.isArray(data.messages) && data.result && !settings.silentResult) {
    addMsg('system', data.result);
  }

  return data;
}

async function startNewConversation() {
  try {
    if (isProcessing) {
      if (!window.confirm(t('chat.newConversationConfirm'))) return;
      await cancelCurrentRequest();
      const stopped = await waitForProcessingToStop(12000);
      if (!stopped) {
        throw new Error(t('chat.newConversationPending'));
      }
    }

    await executeCommand('/clear', { silentResult: true });
    if (chatInput) chatInput.focus();
  } catch (e) {
    addMsg('system', 'Failed: ' + e.message);
  }
}

async function sendCommand(cmd) {
  try {
    await executeCommand(cmd);
  } catch(e) { addMsg('system','Failed: '+e.message); }
}

// ==================== DOM Helpers ====================
function addMsg(role, text, options) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;

  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = role;

  const bodyEl = document.createElement('div');
  bodyEl.className = 'body';
  if (role === 'assistant' && options && options.streaming) {
    renderAssistantStreamingBody(bodyEl, text);
  } else {
    renderMessageBody(bodyEl, role, text);
  }

  el.appendChild(roleEl);
  el.appendChild(bodyEl);
  messagesEl.appendChild(el);
  scrollChat();
  return el;
}

function ensureReasoningMessage() {
  if (currentReasoningPreEl) return currentReasoningPreEl;

  const el = document.createElement('div');
  el.className = 'msg reasoning';

  const roleEl = document.createElement('div');
  roleEl.className = 'role';
  roleEl.textContent = 'thinking';

  const bodyEl = document.createElement('div');
  bodyEl.className = 'body';

  const detailsEl = document.createElement('details');
  detailsEl.className = 'reasoning-box';
  detailsEl.open = true;

  const summaryEl = document.createElement('summary');
  summaryEl.className = 'reasoning-summary';
  summaryEl.textContent = getReasoningLabel();

  const preEl = document.createElement('pre');
  preEl.className = 'reasoning-pre streaming-cursor';
  preEl.dataset.rawText = '';

  detailsEl.appendChild(summaryEl);
  detailsEl.appendChild(preEl);
  bodyEl.appendChild(detailsEl);
  el.appendChild(roleEl);
  el.appendChild(bodyEl);
  messagesEl.appendChild(el);

  currentReasoningEl = el;
  currentReasoningPreEl = preEl;
  currentReasoningSummaryEl = summaryEl;
  scrollChat();
  return preEl;
}

function scrollChat() { messagesEl.scrollTop = messagesEl.scrollHeight; }

let lastUsageData = null;

function addResponseSummary() {
  if (!lastUsageData) return;
  const el = document.createElement('div');
  el.className = 'usage-bar';
  const total = lastUsageData.promptTokens + lastUsageData.completionTokens;
  const label = currentLang === 'zh-CN'
    ? ('✓ 完成 · 消耗 Token: ' + total + ' (输入:' + lastUsageData.promptTokens + ' 输出:' + lastUsageData.completionTokens + ')')
    : ('✓ Done · Tokens: ' + total + ' (P:' + lastUsageData.promptTokens + ' C:' + lastUsageData.completionTokens + ')');
  el.textContent = label;
  if (lastReasoningText) {
    el.style.cursor = 'pointer';
    el.title = currentLang === 'zh-CN' ? '点击查看思考过程' : 'Click to view thinking process';
    el.onclick = function() {
      let detailsEl = el.nextElementSibling;
      if (detailsEl && detailsEl.classList.contains('reasoning-box')) {
        detailsEl.open = !detailsEl.open;
        return;
      }
      const box = document.createElement('details');
      box.className = 'reasoning-box';
      box.open = true;
      const summary = document.createElement('summary');
      summary.className = 'reasoning-summary';
      summary.textContent = currentLang === 'zh-CN' ? '思考过程' : 'Thinking process';
      const pre = document.createElement('pre');
      pre.className = 'reasoning-pre';
      pre.textContent = lastReasoningText;
      box.appendChild(summary);
      box.appendChild(pre);
      el.parentNode.insertBefore(box, el.nextSibling);
      scrollChat();
    };
  }
  messagesEl.appendChild(el);
  scrollChat();
  lastUsageData = null;
  lastReasoningText = '';
}
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function escCode(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escJs(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}
function formatSize(b) { if(b<1024) return b+'B'; if(b<1024*1024) return (b/1024).toFixed(1)+'KB'; return (b/1024/1024).toFixed(1)+'MB'; }
function fmtArgs(n,a) {
  if(!a) return '';
  switch(n) { case 'read_file': case 'write_file': case 'edit_file': return a.path||'';
    case 'bash': return (a.command||'').substring(0,60);
    case 'start_subtask': return (a.command||'').substring(0,60);
    case 'read_subtask_output': case 'stop_subtask': return a.task_id||'';
    case 'grep': return '/'+( a.pattern||'')+'/'+(a.path?' in '+a.path:'');
    case 'glob': return a.pattern||'';
    default: return JSON.stringify(a).substring(0,60); }
}

function renderMessageBody(bodyEl, role, text) {
  const value = String(text || '');
  bodyEl.dataset.rawText = value;
  delete bodyEl.dataset.streamState;

  if (role === 'assistant') {
    bodyEl.classList.remove('streaming-text');
    bodyEl.classList.add('markdown-body');
    bodyEl.innerHTML = renderMarkdown(value);
    highlightMarkdownBlocks(bodyEl);
    renderMathContent(bodyEl);
    return;
  }

  bodyEl.classList.remove('markdown-body');
  bodyEl.innerHTML = renderPlainText(value);
}

function renderAssistantStreamingBody(bodyEl, text) {
  const value = String(text || '');
  bodyEl.dataset.rawText = value;
  bodyEl.dataset.streamState = 'streaming';
  bodyEl.classList.remove('markdown-body');
  bodyEl.classList.add('streaming-text');
  bodyEl.textContent = value;
}

function appendReasoningContent(chunk) {
  const preEl = ensureReasoningMessage();
  const next = (preEl.dataset.rawText || '') + String(chunk || '');
  preEl.dataset.rawText = next;
  preEl.textContent = next;
}

function appendAssistantContent(bodyEl, chunk) {
  renderAssistantStreamingBody(bodyEl, (bodyEl.dataset.rawText || '') + String(chunk || ''));
}

function getReasoningLabel(done) {
  const provider = activeProvider || '';
  let modelStr = '';
  if (provider && providerList && providerList.length > 0) {
    const p = providerList.find(x => x.type === provider);
    if (p && p.model) {
      const parts = p.model.split('/');
      modelStr = ' (' + (parts[parts.length - 1] || p.model) + ')';
    }
  }
  const label = currentLang === 'zh-CN'
    ? (done ? '思考完成' : '正在思考')
    : (done ? 'Thinking done' : 'Thinking');
  if (!provider) return label;
  return provider + modelStr + ' · ' + label;
}

function finalizeReasoningMessage() {
  if (!currentReasoningPreEl) return;
  currentReasoningPreEl.classList.remove('streaming-cursor');
  if (currentReasoningSummaryEl) {
    currentReasoningSummaryEl.textContent = getReasoningLabel(true);
  }
}

function finalizeAssistantMessage(bodyEl) {
  if (!bodyEl) return;
  renderMessageBody(bodyEl, 'assistant', bodyEl.dataset.rawText || '');
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return;

  if (window.navigator && window.navigator.clipboard && typeof window.navigator.clipboard.writeText === 'function') {
    await window.navigator.clipboard.writeText(value);
    return;
  }

  const helper = document.createElement('textarea');
  helper.value = value;
  helper.setAttribute('readonly', 'readonly');
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  helper.style.pointerEvents = 'none';
  document.body.appendChild(helper);
  helper.select();
  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(helper);
  }
}

async function copyCodeBlock(button) {
  if (!button || button.dataset.copying === 'true') return;

  const wrapper = typeof button.closest === 'function' ? button.closest('.markdown-code-block') : null;
  const codeEl = wrapper ? wrapper.querySelector('pre code') : null;
  if (!codeEl) return;

  const originalLabel = t('chat.copyCode');
  button.dataset.copying = 'true';

  try {
    await copyTextToClipboard(codeEl.textContent || '');
    button.classList.add('copied');
    button.textContent = t('chat.copied');
    window.setTimeout(() => {
      button.classList.remove('copied');
      button.textContent = originalLabel;
      delete button.dataset.copying;
    }, 1400);
  } catch (error) {
    button.textContent = originalLabel;
    delete button.dataset.copying;
  }
}

function renderPlainText(text) {
  let html = esc(String(text || '')).replace(/\n/g, '<br>');
  
  // Render image previews: ![alt](data:image/...)
  html = html.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, function(match, alt, src) {
    return '<div class="message-image"><img src="' + escAttr(src) + '" alt="' + escAttr(alt) + '" /><span class="image-label">' + esc(alt || 'Image') + '</span></div>';
  });
  
  return html;
}

const MARKDOWN_FENCE = String.fromCharCode(96).repeat(3);
const MARKDOWN_TICK = String.fromCharCode(96);

function renderMarkdownCodeBlock(language, code) {
  const lang = normalizeHighlightLang(language);
  const langClass = lang ? ' class="language-' + escAttr(lang) + '"' : '';
  const languageLabel = String(language || lang || 'text').trim() || 'text';
  return ''
    + '<div class="markdown-code-block">'
    + '<div class="markdown-code-toolbar">'
    + '<span class="markdown-code-lang">' + esc(languageLabel) + '</span>'
    + '<button type="button" class="copy-code-btn" data-i18n="chat.copyCode">' + esc(t('chat.copyCode')) + '</button>'
    + '</div>'
    + '<pre><code' + langClass + '>' + esc(code) + '</code></pre>'
    + '</div>';
}

function renderMarkdown(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  if (!source) return '';

  const lines = source.split('\n');
  const parts = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index++;
      continue;
    }

    if (trimmed.startsWith(MARKDOWN_FENCE)) {
      const fenceInfo = trimmed.slice(MARKDOWN_FENCE.length).trim().split(/\s+/)[0] || '';
      index++;
      const codeLines = [];
      while (index < lines.length && !lines[index].trim().startsWith(MARKDOWN_FENCE)) {
        codeLines.push(lines[index]);
        index++;
      }
      if (index < lines.length && lines[index].trim().startsWith(MARKDOWN_FENCE)) index++;
      parts.push(renderMarkdownCodeBlock(fenceInfo, codeLines.join('\n')));
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      parts.push('<h' + level + '>' + renderInlineMarkdown(headingMatch[2]) + '</h' + level + '>');
      index++;
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmed)) {
      parts.push('<hr>');
      index++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index++;
      }
      parts.push('<blockquote>' + renderMarkdown(quoteLines.join('\n')) + '</blockquote>');
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      const renderedTable = renderMarkdownTable(lines, index);
      parts.push(renderedTable.html);
      index = renderedTable.nextIndex;
      continue;
    }

    const listType = getMarkdownListType(line);
    if (listType) {
      const renderedList = renderMarkdownList(lines, index, listType);
      parts.push(renderedList.html);
      index = renderedList.nextIndex;
      continue;
    }

    const paragraphLines = [line];
    index++;
    while (index < lines.length) {
      const next = lines[index];
      const nextTrimmed = next.trim();
      if (!nextTrimmed) break;
      if (nextTrimmed.startsWith(MARKDOWN_FENCE)) break;
      if (/^(#{1,6})\s+/.test(next)) break;
      if (/^>\s?/.test(next)) break;
      if (isMarkdownTableStart(lines, index)) break;
      if (getMarkdownListType(next)) break;
      if (/^([-*_])(?:\s*\1){2,}\s*$/.test(nextTrimmed)) break;
      paragraphLines.push(next);
      index++;
    }
    parts.push('<p>' + renderInlineMarkdown(paragraphLines.join('\n')).replace(/\n/g, '<br>') + '</p>');
  }

  return parts.join('');
}

function getMarkdownListType(line) {
  if (/^\s*[-*+]\s+/.test(line)) return 'ul';
  if (/^\s*\d+\.\s+/.test(line)) return 'ol';
  return '';
}

function isMarkdownTableStart(lines, startIndex) {
  if (startIndex + 1 >= lines.length) return false;
  const headerCells = parseMarkdownTableRow(lines[startIndex]);
  if (headerCells.length < 2) return false;
  return isMarkdownTableSeparator(lines[startIndex + 1], headerCells.length);
}

function renderMarkdownTable(lines, startIndex) {
  const headerCells = parseMarkdownTableRow(lines[startIndex]);
  const rows = [];
  let cursor = startIndex + 2;

  while (cursor < lines.length) {
    const currentLine = lines[cursor];
    if (!currentLine.trim()) break;
    if (isMarkdownTableSeparator(currentLine)) break;
    const cells = parseMarkdownTableRow(currentLine);
    if (cells.length === 0) break;
    rows.push(cells);
    cursor++;
  }

  const columnCount = Math.max(
    headerCells.length,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  );

  const normalizedHeader = normalizeMarkdownTableCells(headerCells, columnCount);
  const normalizedRows = rows.map(row => normalizeMarkdownTableCells(row, columnCount));

  const thead = '<thead><tr>' + normalizedHeader.map(cell => '<th>' + renderInlineMarkdown(cell) + '</th>').join('') + '</tr></thead>';
  const tbody = normalizedRows.length === 0
    ? ''
    : '<tbody>' + normalizedRows.map(row => '<tr>' + row.map(cell => '<td>' + renderInlineMarkdown(cell) + '</td>').join('') + '</tr>').join('') + '</tbody>';

  return {
    html: '<div class="markdown-table-wrap"><table>' + thead + tbody + '</table></div>',
    nextIndex: cursor,
  };
}

function parseMarkdownTableRow(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || !trimmed.includes('|')) return [];

  let normalized = trimmed;
  if (normalized.startsWith('|')) normalized = normalized.slice(1);
  if (normalized.endsWith('|')) normalized = normalized.slice(0, -1);

  return normalized.split('|').map(cell => cell.trim());
}

function isMarkdownTableSeparator(line, expectedColumns) {
  const cells = parseMarkdownTableRow(line);
  if (cells.length === 0) return false;
  if (expectedColumns && cells.length !== expectedColumns) return false;
  return cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function normalizeMarkdownTableCells(cells, columnCount) {
  const result = cells.slice(0, columnCount);
  while (result.length < columnCount) {
    result.push('');
  }
  return result;
}

function renderMarkdownList(lines, startIndex, listType) {
  const tag = listType;
  const items = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const matcher = tag === 'ol' ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
    const match = lines[cursor].match(matcher);
    if (!match) break;

    const itemLines = [match[1]];
    cursor++;

    while (cursor < lines.length) {
      const next = lines[cursor];
      if (!next.trim()) {
        const nextLine = lines[cursor + 1] || '';
        if (matcher.test(nextLine)) {
          cursor++;
          continue;
        }
        break;
      }
      if (matcher.test(next) || getMarkdownListType(next) || next.trim().startsWith(MARKDOWN_FENCE) || /^>\s?/.test(next) || /^(#{1,6})\s+/.test(next)) {
        break;
      }
      itemLines.push(next.trim());
      cursor++;
    }

    items.push('<li>' + renderInlineMarkdown(itemLines.join(' ')) + '</li>');

    while (cursor < lines.length && !lines[cursor].trim()) {
      const upcoming = lines[cursor + 1] || '';
      if (matcher.test(upcoming)) {
        cursor++;
      } else {
        break;
      }
    }

    if (!matcher.test(lines[cursor] || '')) break;
  }

  return {
    html: '<' + tag + '>' + items.join('') + '</' + tag + '>',
    nextIndex: cursor,
  };
}

function renderInlineMarkdown(text) {
  const placeholders = [];
  let working = String(text || '');

  working = working.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function(_, label, url) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return esc(label);
    return storeMarkdownPlaceholder(placeholders, '<a href="' + escAttr(safeUrl) + '" target="_blank" rel="noreferrer">' + renderInlineMarkdown(label) + '</a>');
  });

  working = replaceInlineCode(working, placeholders);
  working = esc(working);
  working = working.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  working = working.replace(/__([^\n]+?)__/g, '<strong>$1</strong>');
  working = working.replace(/(^|[\s(>])\*([^*\n][^*\n]*?)\*(?=[$\s).,!?:;])/g, '$1<em>$2</em>');
  working = working.replace(/(^|[\s(>])_([^_\n][^_\n]*?)_(?=[$\s).,!?:;])/g, '$1<em>$2</em>');

  for (const placeholder of placeholders) {
    working = working.split(placeholder.token).join(placeholder.html);
  }

  return working;
}

function replaceInlineCode(text, placeholders) {
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(MARKDOWN_TICK, cursor);
    if (start === -1) {
      result += text.slice(cursor);
      break;
    }

    const end = text.indexOf(MARKDOWN_TICK, start + 1);
    if (end === -1) {
      result += text.slice(cursor);
      break;
    }

    result += text.slice(cursor, start);
    result += storeMarkdownPlaceholder(placeholders, '<code>' + esc(text.slice(start + 1, end)) + '</code>');
    cursor = end + 1;
  }

  return result;
}

function storeMarkdownPlaceholder(placeholders, html) {
  const token = '@@MDTOKEN' + placeholders.length + '@@';
  placeholders.push({ token: token, html: html });
  return token;
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(String(url), window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (e) {}
  return '';
}

function normalizeHighlightLang(language) {
  const value = String(language || '').trim().toLowerCase();
  if (!value) return 'plaintext';

  const aliases = {
    typescript: 'typescript',
    ts: 'typescript',
    javascript: 'javascript',
    js: 'javascript',
    jsx: 'javascript',
    tsx: 'typescript',
    python: 'python',
    py: 'python',
    shell: 'bash',
    shellscript: 'bash',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    html: 'html',
    xml: 'xml',
    css: 'css',
    markdown: 'markdown',
    md: 'markdown',
    text: 'plaintext',
    plain: 'plaintext',
    plaintext: 'plaintext',
  };

  const normalized = aliases[value] || value || mapExt(value);
  if (window.hljs && typeof window.hljs.getLanguage === 'function' && window.hljs.getLanguage(normalized)) return normalized;
  return mapExt(value);
}

function highlightMarkdownBlocks(container) {
  if (!window.hljs) return;
  container.querySelectorAll('pre code').forEach(block => {
    try { window.hljs.highlightElement(block); } catch(e) {}
  });
}

function renderMathContent(container) {
  if (typeof window.renderMathInElement !== 'function') return;
  try {
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
      strict: 'ignore',
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    });
  } catch (e) {
    console.error('KaTeX render failed:', e);
  }
}

// ==================== Settings ====================
function normalizeModelName(value) {
  return String(value || '').trim();
}

function mergeSavedModelHistory(existing, preferred) {
  const result = [];
  const seen = new Set();

  function append(value) {
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }
    const normalized = normalizeModelName(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  }

  append(preferred);
  append(existing || []);
  return result.slice(0, 50);
}

function renderSavedModelOptions(provider, currentModel) {
  const selectId = provider === 'nvidia' ? 's-nvidia-model-select' : 's-zen-model-select';
  const hintId = provider === 'nvidia' ? 's-nvidia-models-hint' : 's-zen-models-hint';
  const inputId = provider === 'nvidia' ? 's-nvidia-model' : 's-model';
  const select = document.getElementById(selectId);
  const hint = document.getElementById(hintId);
  const input = document.getElementById(inputId);
  if (!select || !input) return;
  const activeModel = normalizeModelName(currentModel || input.value);
  const models = mergeSavedModelHistory(savedModelHistory[provider], activeModel);

  savedModelHistory[provider] = models;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('settings.savedModelsSelect');
  select.appendChild(placeholder);
  models.forEach(function(model) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  });
  select.value = '';

  if (hint) {
    const label = currentLang === 'zh-CN'
      ? ('已保存模型 ' + models.length + ' 个')
      : (models.length + ' saved models');
    hint.textContent = label + ' · ' + t('settings.customModelHint');
    hint.className = 'settings-hint';
  }
}

function applySavedModelSettings(settings) {
  const saved = settings && settings.savedModels ? settings.savedModels : {};
  savedModelHistory = {
    zenmux: mergeSavedModelHistory(saved.zenmux, settings && settings.model),
    nvidia: mergeSavedModelHistory(saved.nvidia, settings && settings.nvidia && settings.nvidia.model),
  };
  renderSavedModelOptions('zenmux', settings && settings.model);
  renderSavedModelOptions('nvidia', settings && settings.nvidia && settings.nvidia.model);
}

function useSavedModel(provider) {
  const select = document.getElementById(provider === 'nvidia' ? 's-nvidia-model-select' : 's-zen-model-select');
  const input = document.getElementById(provider === 'nvidia' ? 's-nvidia-model' : 's-model');
  if (!select || !input) return;
  const value = normalizeModelName(select.value);
  if (!value) return;
  input.value = value;
  select.value = '';
}

async function openSettings() {
  // Load current settings from server
  try {
    const r = await (await fetch('/api/settings')).json();
    document.getElementById('s-apikey').value = '';
    document.getElementById('s-apikey').placeholder = r.hasApiKey ? r.apiKey : 'sk-...';
    document.getElementById('s-baseurl').value = r.baseUrl || '';
    document.getElementById('s-model').value = r.model || '';
    document.getElementById('s-ollama-url').value = (r.ollama && r.ollama.baseUrl) || 'http://127.0.0.1:11434/v1';
    document.getElementById('s-ollama-model').setAttribute('data-current', (r.ollama && r.ollama.model) || 'qwen3-coder-next');
    document.getElementById('s-ollama-show-reasoning').checked = !!((r.ollama && r.ollama.showReasoning) || r.showOllamaReasoning);
    document.getElementById('s-ollama-pull-name').value = '';
    document.getElementById('s-ollama-pull-progress').textContent = '';
    // Nvidia settings
    document.getElementById('s-nvidia-apikey').value = '';
    document.getElementById('s-nvidia-apikey').placeholder = (r.nvidia && r.nvidia.hasApiKey) ? r.nvidia.apiKey : 'nvapi-...';
    document.getElementById('s-nvidia-baseurl').value = (r.nvidia && r.nvidia.baseUrl) || 'https://integrate.api.nvidia.com/v1';
    document.getElementById('s-nvidia-model').value = (r.nvidia && r.nvidia.model) || 'qwen/qwen3.5-122b-a10b';
    // OpenRouter settings
    document.getElementById('s-openrouter-apikey').value = '';
    document.getElementById('s-openrouter-apikey').placeholder = (r.openrouter && r.openrouter.hasApiKey) ? r.openrouter.apiKey : 'sk-or-...';
    document.getElementById('s-openrouter-baseurl').value = (r.openrouter && r.openrouter.baseUrl) || 'https://openrouter.ai/api/v1';
    document.getElementById('s-openrouter-model').value = (r.openrouter && r.openrouter.model) || 'qwen/qwen3.6-plus-preview';
    document.getElementById('s-openrouter-siteurl').value = (r.openrouter && r.openrouter.siteUrl) || '';
    document.getElementById('s-openrouter-sitename').value = (r.openrouter && r.openrouter.siteName) || '';
    document.getElementById('s-openrouter-apikey-hint').textContent = '';
    document.getElementById('s-permission-mode').value = (r.permission && r.permission.mode) || 'default';
    syncPermissionModeFromSettings(r.permission && r.permission.mode);
    document.getElementById('s-path-rules').value = r.permissionPathRulesText || '';
    document.getElementById('s-denied-commands').value = r.deniedCommandsText || '';
    document.getElementById('s-max-iterations').value = String(r.maxIterations || 100);
    document.getElementById('s-subtask-timeout').value = String(r.subtaskTimeoutSeconds || 3600);
    document.getElementById('s-config-path').textContent = 'Config: ' + (r.configPath || '~/.zen-cli/config.json');
    document.getElementById('s-harness-paths').textContent = [
      r.memoryPath ? ('Memory: ' + r.memoryPath) : '',
      r.pitfallsPath ? ('Pitfalls: ' + r.pitfallsPath) : '',
      Array.isArray(r.customToolDirs) && r.customToolDirs.length > 0 ? ('Tools: ' + r.customToolDirs.join(' | ')) : '',
    ].filter(Boolean).join('\n');
    document.getElementById('s-apikey-hint').textContent = '';
    document.getElementById('s-ollama-hint').textContent = '';
    document.getElementById('s-nvidia-apikey-hint').textContent = '';
    setMemoryBundleHint('');
    applySavedModelSettings(r);
    // Load Ollama model list
    refreshOllamaModels();
  } catch(e) { console.error(e); }
  document.getElementById('settings-overlay').style.display = 'flex';
  applyLang();
}

function closeSettings() {
  document.getElementById('settings-overlay').style.display = 'none';
}

function toggleKeyVisibility() {
  const el = document.getElementById('s-apikey');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function toggleNvidiaKeyVisibility() {
  const el = document.getElementById('s-nvidia-apikey');
  el.type = el.type === 'password' ? 'text' : 'password';
}

function setMemoryBundleHint(message, tone) {
  const el = document.getElementById('s-memory-bundle-hint');
  if (!el) return;
  el.textContent = message || t('settings.memoryBundleHint');
  el.className = 'settings-hint' + (tone === 'ok' ? ' ok' : tone === 'err' ? ' err' : '');
}

async function testZenMux() {
  const hint = document.getElementById('s-apikey-hint');
  hint.textContent = '...';
  hint.className = 'settings-hint';
  const apiKey = document.getElementById('s-apikey').value || '';
  const baseUrl = document.getElementById('s-baseurl').value || '';
  const model = normalizeModelName(document.getElementById('s-model').value);
  if (!model) {
    hint.textContent = t('settings.enterModelName');
    hint.className = 'settings-hint err';
    return;
  }
  try {
    const r = await (await fetch('/api/settings/test', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'zenmux', apiKey, baseUrl, model })
    })).json();
    if (r.success) {
      if (r.savedModels) {
        savedModelHistory.zenmux = mergeSavedModelHistory(r.savedModels.zenmux, model);
        renderSavedModelOptions('zenmux', model);
      }
      if (r.providers) {
        providerList = r.providers;
        renderProviders();
      }
      hint.textContent = t('settings.testSaved') + ': ' + model;
      hint.className = 'settings-hint ok';
    } else {
      hint.textContent = t('settings.testFail') + ': ' + (r.error||'');
      hint.className = 'settings-hint err';
    }
  } catch(e) {
    hint.textContent = t('settings.testFail') + ': ' + e.message;
    hint.className = 'settings-hint err';
  }
}

async function testOllama() {
  const hint = document.getElementById('s-ollama-hint');
  hint.textContent = '...';
  hint.className = 'settings-hint';
  const ollamaBaseUrl = document.getElementById('s-ollama-url').value || '';
  try {
    const r = await (await fetch('/api/settings/test', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'ollama', ollamaBaseUrl })
    })).json();
    if (r.success) {
      hint.textContent = t('settings.testOk') + ' (' + (r.models||[]).slice(0,3).join(', ') + '...)';
      hint.className = 'settings-hint ok';
    } else {
      hint.textContent = t('settings.testFail') + ': ' + (r.error||'');
      hint.className = 'settings-hint err';
    }
  } catch(e) {
    hint.textContent = t('settings.testFail') + ': ' + e.message;
    hint.className = 'settings-hint err';
  }
}

async function testNvidia() {
  const hint = document.getElementById('s-nvidia-apikey-hint');
  hint.textContent = '...';
  hint.className = 'settings-hint';
  const apiKey = document.getElementById('s-nvidia-apikey').value || '';
  const baseUrl = document.getElementById('s-nvidia-baseurl').value || '';
  const model = normalizeModelName(document.getElementById('s-nvidia-model').value);
  if (!model) {
    hint.textContent = t('settings.enterModelName');
    hint.className = 'settings-hint err';
    return;
  }
  try {
    const r = await (await fetch('/api/settings/test', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'nvidia', apiKey, baseUrl, model })
    })).json();
    if (r.success) {
      if (r.savedModels) {
        savedModelHistory.nvidia = mergeSavedModelHistory(r.savedModels.nvidia, model);
        renderSavedModelOptions('nvidia', model);
      }
      if (r.providers) {
        providerList = r.providers;
        renderProviders();
      }
      hint.textContent = t('settings.testSaved') + ': ' + model;
      hint.className = 'settings-hint ok';
    } else {
      hint.textContent = t('settings.testFail') + ': ' + (r.error||'');
      hint.className = 'settings-hint err';
    }
  } catch(e) {
    hint.textContent = t('settings.testFail') + ': ' + e.message;
    hint.className = 'settings-hint err';
  }
}

function toggleOpenRouterKeyVisibility() {
  const el = document.getElementById('s-openrouter-apikey');
  el.type = el.type === 'password' ? 'text' : 'password';
}

async function testOpenRouter() {
  const hint = document.getElementById('s-openrouter-apikey-hint');
  hint.textContent = '...';
  hint.className = 'settings-hint';
  const apiKey = document.getElementById('s-openrouter-apikey').value || '';
  const baseUrl = document.getElementById('s-openrouter-baseurl').value || '';
  const model = normalizeModelName(document.getElementById('s-openrouter-model').value);
  if (!model) {
    hint.textContent = t('settings.enterModelName');
    hint.className = 'settings-hint err';
    return;
  }
  try {
    const r = await (await fetch('/api/settings/test', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'openrouter', apiKey, baseUrl, model })
    })).json();
    if (r.success) {
      hint.textContent = t('settings.testSaved') + ': ' + model;
      hint.className = 'settings-hint ok';
    } else {
      hint.textContent = t('settings.testFail') + ': ' + (r.error||'');
      hint.className = 'settings-hint err';
    }
  } catch(e) {
    hint.textContent = t('settings.testFail') + ': ' + e.message;
    hint.className = 'settings-hint err';
  }
}

async function saveSettings() {
  const payload = {
    baseUrl: document.getElementById('s-baseurl').value,
    model: normalizeModelName(document.getElementById('s-model').value),
    ollama: {
      baseUrl: document.getElementById('s-ollama-url').value,
      model: document.getElementById('s-ollama-model').value,
      showReasoning: document.getElementById('s-ollama-show-reasoning').checked,
    },
    nvidia: {
      baseUrl: document.getElementById('s-nvidia-baseurl').value,
      model: normalizeModelName(document.getElementById('s-nvidia-model').value),
    },
    openrouter: {
      baseUrl: document.getElementById('s-openrouter-baseurl').value,
      model: normalizeModelName(document.getElementById('s-openrouter-model').value),
      siteUrl: document.getElementById('s-openrouter-siteurl').value,
      siteName: document.getElementById('s-openrouter-sitename').value,
    },
    permission: {
      mode: document.getElementById('s-permission-mode').value,
      pathRulesText: document.getElementById('s-path-rules').value,
      deniedCommandsText: document.getElementById('s-denied-commands').value,
    },
    maxIterations: Math.max(1, parseInt(document.getElementById('s-max-iterations').value || '100', 10) || 100),
    subtasks: {
      timeoutSeconds: Math.max(1, parseInt(document.getElementById('s-subtask-timeout').value || '3600', 10) || 3600),
    },
  };
  // Only include API key if user typed a new one
  const newKey = document.getElementById('s-apikey').value;
  if (newKey) payload.apiKey = newKey;

  // Include Nvidia API key if provided
  const nvidiaKey = document.getElementById('s-nvidia-apikey').value;
  if (nvidiaKey) payload.nvidia.apiKey = nvidiaKey;

  // Include OpenRouter API key if provided
  const openrouterKey = document.getElementById('s-openrouter-apikey').value;
  if (openrouterKey) payload.openrouter.apiKey = openrouterKey;

  try {
    const r = await (await fetch('/api/settings', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    })).json();
    if (r.success) {
      showOllamaReasoning = payload.ollama.showReasoning === true;
      savedModelHistory.zenmux = mergeSavedModelHistory(savedModelHistory.zenmux, payload.model);
      savedModelHistory.nvidia = mergeSavedModelHistory(savedModelHistory.nvidia, payload.nvidia.model);
      renderSavedModelOptions('zenmux', payload.model);
      renderSavedModelOptions('nvidia', payload.nvidia.model);
      addMsg('system', t('settings.saved') + ' -> ' + r.configPath);
      // Update provider list
      if (r.providers) { providerList = r.providers; renderProviders(); }
      closeSettings();
      // Refresh providers
      refreshProviders();
    } else {
      addMsg('system', 'Save error: ' + (r.error||''));
    }
  } catch(e) {
    addMsg('system', 'Save failed: ' + e.message);
  }
}

async function exportMemoryBundle() {
  try {
    const bundle = await (await fetch('/api/memory/export')).json();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = 'zen-cli-memory-bundle-' + stamp + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setMemoryBundleHint(t('settings.memoryExported'), 'ok');
  } catch (e) {
    setMemoryBundleHint(String(e.message || e), 'err');
  }
}

function triggerMemoryBundleImport() {
  const input = document.getElementById('memory-bundle-input');
  if (!input) return;
  input.value = '';
  input.click();
}

async function handleMemoryBundleImport(event) {
  const input = event && event.target ? event.target : null;
  const file = input && input.files && input.files[0] ? input.files[0] : null;
  if (!file) return;

  try {
    const bundle = JSON.parse(await file.text());
    const r = await (await fetch('/api/memory/import', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ bundle }),
    })).json();
    if (!r.success) throw new Error(r.error || t('settings.memoryImportFail'));
    setMemoryBundleHint(t('settings.memoryImported'), 'ok');
    refreshPendingChanges();
    addMsg('system', t('settings.memoryImported'));
  } catch (e) {
    setMemoryBundleHint(t('settings.memoryImportFail') + ': ' + e.message, 'err');
  }
}

async function resetMemoryBundle() {
  if (typeof window.confirm === 'function' && !window.confirm(t('settings.memoryResetConfirm'))) {
    return;
  }

  try {
    const r = await (await fetch('/api/memory/reset', { method:'POST' })).json();
    if (!r.success) throw new Error(r.error || t('settings.memoryReset'));
    setMemoryBundleHint(t('settings.memoryReset'), 'ok');
    refreshPendingChanges();
    addMsg('system', t('settings.memoryReset'));
  } catch (e) {
    setMemoryBundleHint(String(e.message || e), 'err');
  }
}

// ==================== Permission Mode (chat bar) ====================
let currentPermissionMode = 'default';

function setPermissionMode(mode) {
  currentPermissionMode = mode;
  document.querySelectorAll('.pm-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function syncPermissionModeFromSettings(mode) {
  if (mode) {
    currentPermissionMode = mode;
  }
  document.querySelectorAll('.pm-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.mode === currentPermissionMode);
  });
}

// ==================== Ollama Model Management ====================
async function refreshOllamaModels() {
  const select = document.getElementById('s-ollama-model');
  const info = document.getElementById('s-ollama-models-info');
  info.textContent = '...';
  info.className = 'settings-hint';

  try {
    const r = await (await fetch('/api/ollama/models')).json();
    select.innerHTML = '';
    if (!r.success) {
      info.textContent = 'Ollama: ' + (r.error || 'unreachable');
      info.className = 'settings-hint err';
      const opt = document.createElement('option');
      opt.value = 'qwen3-coder-next';
      opt.textContent = 'qwen3-coder-next (default)';
      select.appendChild(opt);
      return;
    }

    const allModels = r.models || [];
    const models = allModels.filter(m => m.supportsCompletion !== false);
    const hiddenEmbeddingModels = Math.max(0, allModels.length - models.length);
    if (models.length === 0) {
      info.textContent = hiddenEmbeddingModels > 0
        ? (currentLang === 'zh-CN'
          ? '当前仅检测到 embedding 模型，请选择支持 completion 的本地模型。'
          : 'Only embedding models were detected. Choose a completion-capable local model.')
        : t('settings.noModels');
      info.className = 'settings-hint';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- ' + info.textContent + ' --';
      select.appendChild(opt);
      return;
    }

    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.name;
      const capabilityLabel = m.supportsTools === false
        ? (currentLang === 'zh-CN' ? '仅聊天' : 'chat only')
        : (currentLang === 'zh-CN' ? '支持工具' : 'tools');
      opt.textContent = m.name + ' (' + m.sizeHuman + (m.parameterSize ? ', ' + m.parameterSize : '') + ', ' + capabilityLabel + ')';
      select.appendChild(opt);
    }
    if (currentLang === 'zh-CN') {
      info.textContent = '可聊天模型 ' + models.length + ' 个' + (hiddenEmbeddingModels > 0 ? ('，已隐藏 ' + hiddenEmbeddingModels + ' 个 embedding 模型') : '');
    } else {
      info.textContent = models.length + ' chat-capable models' + (hiddenEmbeddingModels > 0 ? (', hid ' + hiddenEmbeddingModels + ' embedding models') : '');
    }
    info.className = 'settings-hint ok';

    // Try to select current model
    const currentModel = document.getElementById('s-ollama-model').getAttribute('data-current') || '';
    if (currentModel) {
      for (const opt of select.options) {
        if (opt.value === currentModel || opt.value.startsWith(currentModel)) {
          opt.selected = true;
          break;
        }
      }
    }
  } catch(e) {
    info.textContent = 'Error: ' + e.message;
    info.className = 'settings-hint err';
  }
}

async function pullOllamaModel() {
  const nameInput = document.getElementById('s-ollama-pull-name');
  const progress = document.getElementById('s-ollama-pull-progress');
  const modelName = nameInput.value.trim();
  if (!modelName) { progress.textContent = t('settings.enterModelName'); progress.className = 'settings-hint err'; return; }

  progress.textContent = t('settings.pulling');
  progress.className = 'settings-hint';

  try {
    await fetch('/api/ollama/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName })
    });
    // Progress comes via SSE — we just wait
  } catch(e) {
    progress.textContent = 'Error: ' + e.message;
    progress.className = 'settings-hint err';
  }
}

// Hook SSE events for pull progress
function handleOllamaSSE(event) {
  if (event.type === 'ollama_pull_progress') {
    const el = document.getElementById('s-ollama-pull-progress');
    if (el) {
      el.textContent = event.data.status || '...';
      el.className = 'settings-hint';
    }
  }
  if (event.type === 'ollama_pull_done') {
    const el = document.getElementById('s-ollama-pull-progress');
    if (el) {
      el.textContent = t('settings.pullDone') + ': ' + event.data.model;
      el.className = 'settings-hint ok';
    }
    // Refresh the model list
    refreshOllamaModels();
  }
}

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', function() {
  // Bind header button events
  const refreshBtn = document.getElementById('refresh-providers-btn');
  if (refreshBtn) refreshBtn.onclick = refreshProviders;
  
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.onclick = openSettings;
  
  window.addEventListener('resize', () => {
    const activeView = terminalViews.get(activeTerminalId);
    if (activeView && activeView.fitAddon && activeView.fitAddon.fit) {
      activeView.fitAddon.fit();
      void syncTerminalSize(activeTerminalId);
    }
  });
  document.addEventListener('click', function() { hideTreeContextMenu(); });
  document.addEventListener('contextmenu', function(ev) {
    if (!ev.target.closest || !ev.target.closest('.tree-item')) hideTreeContextMenu();
  });
  applyTheme(loadSavedTheme());
  applyLang();
  connectSSE();
});
</script>
</body>
</html>`;
}
