import { getHtmlPage } from '../dist/ui/web-page.js';

function fail(message, error) {
  console.error(`[validate-web-page] ${message}`);
  if (error) {
    console.error(error.stack || String(error));
  }
  process.exit(1);
}

function extractScript() {
  const html = getHtmlPage();
  const match = html.match(/<script>([\s\S]*)<\/script>/);
  if (!match) {
    fail('Unable to find inline UI script in generated HTML.');
  }
  return match[1];
}

function createElement(id = '') {
  let textContentValue = '';
  let innerHTMLValue = '';

  return {
    id,
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    innerHTML: '',
    placeholder: '',
    disabled: false,
    className: '',
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 720,
    scrollWidth: 1280,
    clientWidth: 960,
    clientHeight: 720,
    width: 0,
    height: 0,
    naturalWidth: 1280,
    naturalHeight: 720,
    complete: true,
    draggable: false,
    options: [],
    classList: {
      add() {},
      remove() {},
      contains() { return false; },
      toggle() { return false; },
    },
    appendChild(child) {
      this.options.push(child);
    },
    setAttribute() {},
    getAttribute() { return ''; },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    contains() { return false; },
    remove() {},
    getContext() { return {}; },
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    get textContent() {
      return textContentValue;
    },
    set textContent(value) {
      textContentValue = String(value);
      innerHTMLValue = escapeHtml(value);
    },
    get innerHTML() {
      return innerHTMLValue;
    },
    set innerHTML(value) {
      innerHTMLValue = String(value);
      this.options = [];
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function runRuntimeSmokeTest(script) {
  const elements = new Map();
  const fetchCalls = [];
  const fetchRequests = [];
  const elementAttributes = new Map([['data-theme', 'dark'], ['lang', 'zh-CN']]);
  const storage = new Map();
  const previousFileReader = globalThis.FileReader;
  const documentListeners = new Map();
  const windowListeners = new Map();
  const registerListener = (store, type, listener) => {
    if (!store.has(type)) store.set(type, []);
    store.get(type).push(listener);
  };
  const dispatchListeners = async (store, type, event = {}) => {
    const listeners = store.get(type) || [];
    for (const listener of listeners) {
      await listener({ type, ...event });
    }
  };
  const document = {
    documentElement: createElement('documentElement'),
    body: createElement('body'),
    createElement(tag) { return createElement(tag); },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelector() { return createElement(); },
    querySelectorAll() { return []; },
    addEventListener(type, listener) {
      registerListener(documentListeners, type, listener);
    },
  };

  document.documentElement.getAttribute = (name) => elementAttributes.get(name) || '';
  document.documentElement.setAttribute = (name, value) => {
    elementAttributes.set(name, String(value));
  };

  const window = {
    document,
    location: { origin: 'http://127.0.0.1:3456' },
    devicePixelRatio: 1,
    confirm() { return true; },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    addEventListener(type, listener) {
      registerListener(windowListeners, type, listener);
    },
    hljs: {
      highlightElement() {},
      getLanguage() { return true; },
    },
    renderMathInElement() {},
    Terminal: class Terminal {
      constructor() {
        this.options = {};
      }
      loadAddon() {}
      open() {}
      write() {}
      focus() {}
      dispose() {}
      onData() {}
    },
    FitAddon: {
      FitAddon: class FitAddon {
        fit() {}
      },
    },
    __ZEN_PDFJS__: {
      GlobalWorkerOptions: {},
      getDocument() {
        return {
          promise: Promise.resolve({
            numPages: 3,
            async getPage() {
              return {
                getViewport({ scale }) {
                  return { width: 800 * scale, height: 1100 * scale };
                },
                render() {
                  return { promise: Promise.resolve() };
                },
              };
            },
          }),
        };
      },
    },
  };
  const getComputedStyle = () => ({
    getPropertyValue() { return ''; },
  });

  const fetch = async (url, options = {}) => {
    fetchCalls.push(String(url));
    fetchRequests.push({ url: String(url), options });
    if (String(url) === '/api/terminal/sessions') {
      return { ok: true, json: async () => ({ sessions: [] }) };
    }
    if (String(url) === '/api/settings') {
      if (String((options && options.method) || 'GET').toUpperCase() === 'PUT') {
        return {
          ok: true,
          json: async () => ({ success: true, configPath: '~/.zen-cli/config.json', providers: [] }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          hasApiKey: true,
          apiKey: 'sk-test...1234',
          baseUrl: 'https://zenmux.ai/api/v1',
          model: 'anthropic/claude-sonnet-4.6',
          ollama: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'chat-tools' },
          nvidia: {
            hasApiKey: true,
            apiKey: 'nvapi-te...5678',
            baseUrl: 'https://integrate.api.nvidia.com/v1',
            model: 'qwen/qwen3.5-122b-a10b',
          },
          savedModels: {
            zenmux: ['anthropic/claude-sonnet-4.6', 'openai/gpt-4.1'],
            nvidia: ['qwen/qwen3.5-122b-a10b', 'meta/llama-3.3-70b-instruct'],
          },
          configPath: '~/.zen-cli/config.json',
        }),
      };
    }
    if (String(url) === '/api/settings/test') {
      const payload = JSON.parse(String((options && options.body) || '{}'));
      const model = String(payload.model || '').trim();
      const savedModels = payload.type === 'nvidia'
        ? {
            zenmux: ['anthropic/claude-sonnet-4.6', 'openai/gpt-4.1'],
            nvidia: [model, 'qwen/qwen3.5-122b-a10b', 'meta/llama-3.3-70b-instruct'].filter(Boolean),
          }
        : {
            zenmux: [model, 'anthropic/claude-sonnet-4.6', 'openai/gpt-4.1'].filter(Boolean),
            nvidia: ['qwen/qwen3.5-122b-a10b', 'meta/llama-3.3-70b-instruct'],
          };
      return {
        ok: true,
        json: async () => ({ success: true, model, savedModels, providers: [] }),
      };
    }
    if (String(url) === '/api/ollama/models') {
      return {
        ok: true,
        json: async () => ({
          success: true,
          models: [
            { name: 'chat-tools', sizeHuman: '4.0GB', parameterSize: '4B', supportsCompletion: true, supportsTools: true },
            { name: 'chat-only', sizeHuman: '4.0GB', parameterSize: '4B', supportsCompletion: true, supportsTools: false },
            { name: 'embed-only', sizeHuman: '274MB', parameterSize: '274M', supportsCompletion: false, supportsTools: false },
          ],
        }),
      };
    }
    if (String(url) === '/api/command') {
      return {
        ok: true,
        json: async () => ({ result: 'Conversation cleared.' }),
      };
    }
    if (String(url) === '/api/file/delete') {
      return {
        ok: true,
        json: async () => ({ success: true, type: 'file', path: 'hello.py', trashed: true }),
      };
    }
    if (String(url).startsWith('/api/file?path=')) {
      if (String(url).includes('demo.png')) {
        return {
          ok: true,
          json: async () => ({
            path: 'demo.png',
            extension: 'png',
            size: 4096,
            mimeType: 'image/png',
            previewKind: 'image',
            previewUrl: '/api/file/raw?path=demo.png',
          }),
        };
      }
      if (String(url).includes('report.pdf')) {
        return {
          ok: true,
          json: async () => ({
            path: 'report.pdf',
            extension: 'pdf',
            size: 16384,
            mimeType: 'application/pdf',
            previewKind: 'pdf',
            previewUrl: '/api/file/raw?path=report.pdf',
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          path: 'hello.py',
          content: 'print("hello")\n',
          extension: 'py',
          size: 15,
        }),
      };
    }
    return { ok: true, json: async () => ({ files: [] }) };
  };
  const EventSource = function EventSource() {
    return { onopen: null, onmessage: null, onerror: null, close() {} };
  };
  globalThis.FileReader = class MockFileReader {
    readAsDataURL(file) {
      const result = file && file.mockDataUrl
        ? file.mockDataUrl
        : `data:${(file && file.type) || 'image/png'};base64,TEST`;
      if (typeof this.onload === 'function') {
        this.onload({ target: { result } });
      }
    }
  };

  try {
    const runner = new Function(
      'window',
      'document',
      'fetch',
      'EventSource',
      'console',
      'setTimeout',
      'clearTimeout',
      'getComputedStyle',
      `${script}
return {
  getMentionState,
  updateMentionMenu,
  chatInput,
  applyWorkingDirectory,
  renderMarkdown,
  openFile,
  handleImageUpload,
  handleImagePaste,
  removeImage,
  getAttachedImages: typeof attachedImages !== 'undefined' ? () => attachedImages.slice() : () => [],
  toggleLang,
  toggleTheme,
  openSettings: typeof openSettings === 'function' ? openSettings : undefined,
  testZenMux: typeof testZenMux === 'function' ? testZenMux : undefined,
  testNvidia: typeof testNvidia === 'function' ? testNvidia : undefined,
  useSavedModel: typeof useSavedModel === 'function' ? useSavedModel : undefined,
  refreshOllamaModels: typeof refreshOllamaModels === 'function' ? refreshOllamaModels : undefined,
  formatBackendSystemMessage: typeof formatBackendSystemMessage === 'function' ? formatBackendSystemMessage : undefined,
  formatBackendErrorMessage: typeof formatBackendErrorMessage === 'function' ? formatBackendErrorMessage : undefined,
  deleteTreeEntry: typeof deleteTreeEntry === 'function' ? deleteTreeEntry : undefined,
  setPanelWidths: typeof setPanelWidths === 'function' ? setPanelWidths : undefined,
  renderAssistantStreamingBody: typeof renderAssistantStreamingBody === 'function' ? renderAssistantStreamingBody : undefined,
  finalizeAssistantMessage: typeof finalizeAssistantMessage === 'function' ? finalizeAssistantMessage : undefined,
  startNewConversation: typeof startNewConversation === 'function' ? startNewConversation : undefined,
};`,
    );
    const api = runner(window, document, fetch, EventSource, console, setTimeout, clearTimeout, getComputedStyle);
    await dispatchListeners(documentListeners, 'DOMContentLoaded');
    await dispatchListeners(windowListeners, 'DOMContentLoaded');
    api.chatInput = document.getElementById('chat-input');
    await verifyMentionBehavior(api, fetchCalls);
    await verifyFileOpenBehavior(api, document);
    await verifyPreviewAndDeleteBehavior(api, document, fetchRequests, window);
    verifyMarkdownRendering(api);
    verifyAssistantStreamingRendering(api, document);
    verifyPreferencePersistence(api, window, document);
    verifyResizablePanels(api, window, document);
    await verifyImageAttachmentBehavior(api, document);
    await verifyNewConversationBehavior(api, document, fetchRequests);
    await verifyOllamaModelFiltering(api, document);
    await verifyCustomModelSettings(api, document, fetchRequests);
  } catch (error) {
    fail('UI script runtime smoke test failed.', error);
  } finally {
    globalThis.FileReader = previousFileReader;
  }
}

async function verifyMentionBehavior(api, fetchCalls) {
  const cases = [
    { input: '@', shouldMatch: true },
    { input: '看一下@', shouldMatch: true },
    { input: 'please check @src', shouldMatch: true },
    { input: 'foo@bar', shouldMatch: false },
  ];

  for (const testCase of cases) {
    api.chatInput.value = testCase.input;
    api.chatInput.selectionStart = testCase.input.length;
    api.chatInput.selectionEnd = testCase.input.length;
    const state = api.getMentionState();

    if (Boolean(state) !== testCase.shouldMatch) {
      throw new Error(`Mention detection mismatch for "${testCase.input}"`);
    }
  }

  api.applyWorkingDirectory({
    workingDir: '/tmp/project',
    tree: [
      { type: 'file', path: 'src/ui/web-page.ts', name: 'web-page.ts' },
      { type: 'directory', path: 'src', name: 'src', children: [
        { type: 'file', path: 'src/ui/web-server.ts', name: 'web-server.ts' },
      ] },
    ],
  });

  api.chatInput.value = '@';
  api.chatInput.selectionStart = 1;
  api.chatInput.selectionEnd = 1;
  await api.updateMentionMenu();
  await api.updateMentionMenu();

  const mentionSearchCalls = fetchCalls.filter(url => url.startsWith('/api/files/search'));
  if (mentionSearchCalls.length !== 0) {
    throw new Error(`Expected zero remote searches for local @ suggestions, got ${mentionSearchCalls.length}`);
  }

  api.chatInput.value = '@src';
  api.chatInput.selectionStart = 4;
  api.chatInput.selectionEnd = 4;
  await api.updateMentionMenu();
  await api.updateMentionMenu();

  const remoteSearchCalls = fetchCalls.filter(url => url.startsWith('/api/files/search?q=src'));
  if (remoteSearchCalls.length !== 1) {
    throw new Error(`Expected one cached remote mention search for @src, got ${remoteSearchCalls.length}`);
  }
}

async function verifyFileOpenBehavior(api, document) {
  await api.openFile('hello.py', 'hello.py');

  if (document.getElementById('editor-welcome').style.display !== 'none') {
    throw new Error('Opening a file should hide the editor welcome state.');
  }
  if (document.getElementById('code-view').style.display !== 'block') {
    throw new Error('Opening a regular file should show the code view.');
  }
  if (!String(document.getElementById('editor-info').textContent || '').includes('hello.py')) {
    throw new Error('Opening a file should update the editor status bar.');
  }
}

async function verifyPreviewAndDeleteBehavior(api, document, fetchRequests, window) {
  await api.openFile('demo.png', 'demo.png');

  if (document.getElementById('preview-view').style.display !== 'block') {
    throw new Error('Opening an image should show the preview view.');
  }
  if (!String(document.getElementById('preview-view').innerHTML).includes('preview-image')) {
    throw new Error('Image previews should render an image preview shell.');
  }
  if (document.getElementById('editor-actions').style.display !== 'none') {
    throw new Error('Preview-only files should hide editor action buttons.');
  }

  await api.openFile('report.pdf', 'report.pdf');
  if (document.getElementById('preview-view').style.display !== 'block') {
    throw new Error('Opening a PDF should show the preview view.');
  }

  let confirmMessage = '';
  window.confirm = (message) => {
    confirmMessage = String(message);
    return true;
  };

  await api.deleteTreeEntry('assets', 'directory', 'assets');
  if (!confirmMessage.includes('assets')) {
    throw new Error('Deleting a directory should ask for confirmation with the folder name.');
  }

  const deleteRequest = fetchRequests
    .filter(entry => entry.url === '/api/file/delete')
    .map(entry => JSON.parse(String(entry.options.body || '{}')))
    .find(entry => entry.path === 'assets');
  if (!deleteRequest) {
    throw new Error('Deleting from the file tree should call the delete API.');
  }
}

function verifyMarkdownRendering(api) {
  const sample = [
    '元组是不可变的，无法直接添加/删除元素，需要用拼接方式替代。',
    '',
    '### 主要改动说明',
    '',
    '```python',
    'print("Hello, World!")',
    '```',
    '',
    '|  | 列表版本 | 元组版本 |',
    '| --- | --- | --- |',
    '| 定义 | `[ ... ]` | `( ... )` |',
    '| 添加元素 | `append(\"芒果\")` | `fruits + (\"芒果\",)` 拼接新元组 |',
    '',
    '> 注意：(`\"芒果\",`) 末尾的逗号不可省略。',
  ].join('\n');

  const rendered = api.renderMarkdown(sample);
  if (!rendered.includes('<h3>主要改动说明</h3>')) {
    throw new Error('Markdown heading rendering check failed.');
  }
  if (!rendered.includes('<table>') || !rendered.includes('<th>列表版本</th>')) {
    throw new Error('Markdown table rendering check failed.');
  }
  if (!rendered.includes('<blockquote>')) {
    throw new Error('Markdown blockquote rendering check failed.');
  }
  if (!rendered.includes('copy-code-btn') || !rendered.includes('markdown-code-toolbar')) {
    throw new Error('Markdown code block copy UI rendering check failed.');
  }
}

function verifyAssistantStreamingRendering(api, document) {
  const body = document.createElement('div');
  api.renderAssistantStreamingBody(body, '**粗体**\n$E=mc^2$');

  if (String(body.textContent || '') !== '**粗体**\n$E=mc^2$') {
    throw new Error('Streaming assistant text should stay as raw plain text during generation.');
  }
  if (String(body.innerHTML || '').includes('<strong>')) {
    throw new Error('Streaming assistant text should not render Markdown before completion.');
  }

  api.finalizeAssistantMessage(body);
  if (!String(body.innerHTML || '').includes('<strong>粗体</strong>')) {
    throw new Error('Assistant text should render Markdown after the stream finishes.');
  }
}

function verifyPreferencePersistence(api, window, document) {
  if (window.localStorage.getItem('zen-cli.ui.lang') !== 'zh-CN') {
    throw new Error('Initial language preference was not persisted.');
  }
  if (window.localStorage.getItem('zen-cli.ui.theme') !== 'dark') {
    throw new Error('Initial theme preference was not persisted.');
  }
  if (document.getElementById('lang-btn').textContent !== '中') {
    throw new Error('Initial language button label does not reflect the active language.');
  }

  api.toggleLang();
  if (window.localStorage.getItem('zen-cli.ui.lang') !== 'en-US') {
    throw new Error('Language toggle did not update persisted preference.');
  }
  if (document.documentElement.getAttribute('lang') !== 'en-US') {
    throw new Error('Language toggle did not update document lang attribute.');
  }
  if (document.getElementById('lang-btn').textContent !== 'EN') {
    throw new Error('Language button label does not reflect the toggled language.');
  }

  api.toggleTheme();
  if (window.localStorage.getItem('zen-cli.ui.theme') !== 'light') {
    throw new Error('Theme toggle did not update persisted preference.');
  }
  if (document.documentElement.getAttribute('data-theme') !== 'light') {
    throw new Error('Theme toggle did not update document theme attribute.');
  }
}

function verifyResizablePanels(api, window, document) {
  if (typeof api.setPanelWidths !== 'function') {
    throw new Error('Resizable panel helper was not exported.');
  }

  api.setPanelWidths(260, 320);

  if (document.getElementById('sidebar').style.width !== '260px') {
    throw new Error('Sidebar width should update when panel sizes are applied.');
  }
  if (document.getElementById('chat-panel').style.width !== '320px') {
    throw new Error('Chat panel width should update when panel sizes are applied.');
  }
  if (window.localStorage.getItem('zen-cli.ui.sidebarWidth') !== '260') {
    throw new Error('Sidebar width should persist in local storage.');
  }
  if (window.localStorage.getItem('zen-cli.ui.chatWidth') !== '320') {
    throw new Error('Chat panel width should persist in local storage.');
  }
}

async function verifyImageAttachmentBehavior(api, document) {
  const uploadEvent = {
    target: {
      files: Array.from({ length: 6 }, (_, index) => ({
        name: `image-${index + 1}.png`,
        type: 'image/png',
        mockDataUrl: `data:image/png;base64,IMAGE${index + 1}`,
      })),
      value: 'selected',
    },
  };

  await api.handleImageUpload(uploadEvent);

  if (api.getAttachedImages().length !== 5) {
    throw new Error('Image uploads should be limited to five attachments.');
  }
  if (uploadEvent.target.value !== '') {
    throw new Error('Image upload input should be cleared after selection.');
  }
  if (!document.getElementById('chat-images-container').innerHTML.includes('chat-image-preview')) {
    throw new Error('Attached images should render as thumbnails in the input area.');
  }
  if (!document.getElementById('chat-images-status').textContent.includes('5')) {
    throw new Error('Image attachment status should show the current image count.');
  }
  if (document.getElementById('upload-img-btn').disabled !== true) {
    throw new Error('Upload button should be disabled when the image limit is reached.');
  }

  api.removeImage(0);
  if (api.getAttachedImages().length !== 4) {
    throw new Error('Removing an attached image should update the attachment list.');
  }
  if (document.getElementById('upload-img-btn').disabled !== false) {
    throw new Error('Upload button should be re-enabled after removing an image.');
  }

  let prevented = false;
  await api.handleImagePaste({
    clipboardData: {
      items: [
        {
          kind: 'file',
          getAsFile() {
            return {
              name: '',
              type: 'image/png',
              mockDataUrl: 'data:image/png;base64,PASTED',
            };
          },
        },
      ],
    },
    preventDefault() {
      prevented = true;
    },
  });

  if (!prevented) {
    throw new Error('Pasting an image should prevent the default text paste behavior.');
  }
  if (api.getAttachedImages().length !== 5) {
    throw new Error('Pasted images should be added to the same attachment list.');
  }
}

async function verifyNewConversationBehavior(api, document, fetchRequests) {
  document.getElementById('messages').innerHTML = '<div class="msg assistant">reply</div>';
  document.getElementById('chat-input').value = 'draft message';

  await api.handleImageUpload({
    target: {
      files: [
        {
          name: 'draft.png',
          type: 'image/png',
          mockDataUrl: 'data:image/png;base64,DRAFT',
        },
      ],
      value: 'selected',
    },
  });

  await api.startNewConversation();

  if (document.getElementById('messages').innerHTML !== '') {
    throw new Error('Starting a new conversation should clear the chat message list.');
  }
  if (document.getElementById('chat-input').value !== '') {
    throw new Error('Starting a new conversation should clear the draft input.');
  }
  if (api.getAttachedImages().length !== 0) {
    throw new Error('Starting a new conversation should clear attached images.');
  }

  const clearRequest = fetchRequests
    .filter(entry => entry.url === '/api/command')
    .map(entry => JSON.parse(String(entry.options.body || '{}')))
    .find(entry => entry.command === '/clear');
  if (!clearRequest) {
    throw new Error('Starting a new conversation should call the command API with /clear.');
  }
}

async function verifyOllamaModelFiltering(api, document) {
  document.getElementById('s-ollama-model').setAttribute = function(name, value) {
    this.dataset[name] = String(value);
  };
  document.getElementById('s-ollama-model').getAttribute = function(name) {
    return this.dataset[name] || '';
  };
  document.getElementById('s-ollama-model').setAttribute('data-current', 'chat-only');

  await api.refreshOllamaModels();

  const select = document.getElementById('s-ollama-model');
  const optionValues = select.options.map(option => option.value);
  if (optionValues.includes('embed-only')) {
    throw new Error('Embedding-only Ollama models should be hidden from the selector.');
  }
  if (!optionValues.includes('chat-tools') || !optionValues.includes('chat-only')) {
    throw new Error('Chat-capable Ollama models are missing from the selector.');
  }

  const optionLabels = select.options.map(option => option.textContent);
  if (!optionLabels.some(label => {
    const text = String(label);
    return text.includes('仅聊天') || text.includes('chat only');
  })) {
    throw new Error('Chat-only Ollama models should be labeled in the selector.');
  }

  const infoText = document.getElementById('s-ollama-models-info').textContent;
  if (!String(infoText).includes('embedding')) {
    throw new Error('Ollama model info should mention hidden embedding models.');
  }

  const systemMessage = api.formatBackendSystemMessage('OLLAMA_CHAT_ONLY::chat-only');
  if (!String(systemMessage).includes('仅聊天模式') && !String(systemMessage).includes('chat-only mode') && !String(systemMessage).includes('chat-only mode'.replace('-', ' '))) {
    throw new Error('Ollama chat-only system message was not localized correctly.');
  }

  const errorMessage = api.formatBackendErrorMessage('OLLAMA_MODEL_NO_CHAT_SUPPORT::embed-only');
  if (!String(errorMessage).includes('embedding-only')) {
    throw new Error('Ollama embedding-only error message should explain the issue.');
  }
}

async function verifyCustomModelSettings(api, document, fetchRequests) {
  await api.openSettings();

  const zenList = document.getElementById('s-zen-model-select').options.map(option => option.value);
  const nvidiaList = document.getElementById('s-nvidia-model-select').options.map(option => option.value);
  if (!zenList.includes('openai/gpt-4.1')) {
    throw new Error('Saved ZenMux models should populate the selector.');
  }
  if (!nvidiaList.includes('meta/llama-3.3-70b-instruct')) {
    throw new Error('Saved NVIDIA models should populate the selector.');
  }

  document.getElementById('s-zen-model-select').value = 'openai/gpt-4.1';
  api.useSavedModel('zenmux');
  if (document.getElementById('s-model').value !== 'openai/gpt-4.1') {
    throw new Error('Choosing a saved ZenMux model should copy it into the input.');
  }

  document.getElementById('s-nvidia-model-select').value = 'meta/llama-3.3-70b-instruct';
  api.useSavedModel('nvidia');
  if (document.getElementById('s-nvidia-model').value !== 'meta/llama-3.3-70b-instruct') {
    throw new Error('Choosing a saved NVIDIA model should copy it into the input.');
  }

  document.getElementById('s-model').value = 'openai/o4-mini';
  await api.testZenMux();
  const zenRequest = fetchRequests
    .filter(entry => entry.url === '/api/settings/test')
    .map(entry => JSON.parse(String(entry.options.body || '{}')))
    .find(entry => entry.type === 'zenmux' && entry.model === 'openai/o4-mini');
  if (!zenRequest) {
    throw new Error('ZenMux test requests should include the custom model name.');
  }
  if (!document.getElementById('s-zen-model-select').options.map(option => option.value).includes('openai/o4-mini')) {
    throw new Error('Successful ZenMux tests should add the custom model to the saved list.');
  }

  document.getElementById('s-nvidia-model').value = 'deepseek/deepseek-r1';
  await api.testNvidia();
  const nvidiaRequest = fetchRequests
    .filter(entry => entry.url === '/api/settings/test')
    .map(entry => JSON.parse(String(entry.options.body || '{}')))
    .find(entry => entry.type === 'nvidia' && entry.model === 'deepseek/deepseek-r1');
  if (!nvidiaRequest) {
    throw new Error('NVIDIA test requests should include the custom model name.');
  }
  if (!document.getElementById('s-nvidia-model-select').options.map(option => option.value).includes('deepseek/deepseek-r1')) {
    throw new Error('Successful NVIDIA tests should add the custom model to the saved list.');
  }
}

async function main() {
  const script = extractScript();

  try {
    new Function(script);
  } catch (error) {
    console.error('Script syntax error details:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    const lines = script.split('\n');
    const lineMatch = error.stack.match(/<anonymous>:(\d+)/);
    if (lineMatch) {
      const lineNum = parseInt(lineMatch[1]);
      console.error('\nAround line', lineNum);
      for (let i = Math.max(0, lineNum - 3); i < Math.min(lines.length, lineNum + 3); i++) {
        console.error((i + 1) + ':', lines[i].substring(0, 100));
      }
    }
    fail('UI script syntax check failed.', error);
  }

  await runRuntimeSmokeTest(script);
  console.log('[validate-web-page] UI script syntax and startup smoke checks passed.');
}

await main();
