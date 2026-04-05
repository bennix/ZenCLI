const decoder = new TextDecoder();

function parseSseChunk(buffer, events) {
  const chunks = buffer.split('\n\n');
  const remainder = chunks.pop() || '';

  for (const chunk of chunks) {
    const line = chunk.split('\n').find(entry => entry.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // Ignore malformed keep-alive chunks.
    }
  }

  return remainder;
}

async function main() {
  const baseUrl = process.argv[2] || 'http://127.0.0.1:3456';
  const chatMessage = process.argv[3] || '只回复 OK，不要调用任何工具。';

  const streamResp = await fetch(`${baseUrl}/api/stream`);
  if (!streamResp.ok || !streamResp.body) {
    throw new Error(`Unable to open SSE stream: ${streamResp.status}`);
  }

  const reader = streamResp.body.getReader();
  const events = [];
  let buffer = '';

  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, events);
      if (events.some(event => event.type === 'done' || event.type === 'error')) break;
    }
  })();

  const switchResp = await fetch(`${baseUrl}/api/providers/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'ollama' }),
  });
  if (!switchResp.ok) {
    throw new Error(`Provider switch failed: ${switchResp.status}`);
  }

  const chatResp = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: chatMessage }),
  });
  if (!chatResp.ok) {
    throw new Error(`Chat request failed to start: ${chatResp.status}`);
  }

  const startedAt = Date.now();
  while (!events.some(event => event.type === 'done' || event.type === 'error')) {
    if (Date.now() - startedAt > 45_000) {
      throw new Error('Timed out waiting for Ollama SSE response.');
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  await reader.cancel().catch(() => {});
  await pump.catch(() => {});

  const summary = events.filter(event =>
    ['provider_changed', 'system', 'content', 'error', 'done'].includes(event.type),
  );

  console.log(JSON.stringify(summary, null, 2));

  const failure = summary.find(event => event.type === 'error');
  if (failure) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error.stack || String(error));
  process.exit(1);
});
