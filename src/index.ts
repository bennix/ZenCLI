#!/usr/bin/env node
// ============================================================
// zen-cli  —  Entry Point (Web GUI mode)
// ============================================================
// Load config → detect providers → start HTTP server → open browser

import { exec } from 'node:child_process';
import chalk from 'chalk';
import { loadConfig, validateConfig } from './config.js';
import { applyShellEnvironmentToProcess } from './core/shell-environment.js';
import { DEFAULT_APP_PORT, startWebServerWithFallback } from './server-bootstrap.js';
import { WebServer } from './ui/web-server.js';

async function main(): Promise<void> {
  await applyShellEnvironmentToProcess();

  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error(chalk.red('\n  Configuration error:\n'));
    for (const err of errors) {
      console.error(chalk.red(`  ${err}\n`));
    }
    process.exit(1);
  }

  let port = DEFAULT_APP_PORT;
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    port = parseInt(process.argv[portIdx + 1], 10) || DEFAULT_APP_PORT;
  }

  console.log(chalk.gray('\n  Detecting providers...'));

  const server = new WebServer(config);
  const { providers, active, port: actualPort } = await startWebServerWithFallback(server, port);

  const url = `http://127.0.0.1:${actualPort}`;

  console.log('');
  console.log(chalk.cyan.bold('  zen-cli') + chalk.gray(' v0.5.0'));
  console.log('');

  // Show provider status
  for (const p of providers) {
    const status = p.available ? chalk.green('available') : chalk.red('unavailable');
    const isActive = p.type === active.type ? chalk.cyan(' [active]') : '';
    console.log(`  ${chalk.yellow(p.name.padEnd(16))} ${status}${isActive}`);
    console.log(chalk.gray(`    ${p.baseUrl} → ${p.model}`));
  }

  console.log('');
  console.log(chalk.green(`  Server: ${url}`));
  console.log(chalk.gray('  Press Ctrl+C to stop.\n'));

  openBrowser(url);
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(chalk.yellow(`  Could not open browser. Visit ${url} manually.`));
    }
  });
}

main().catch((err) => {
  console.error(chalk.red(`\n  Fatal error: ${err.message}\n`));
  process.exit(1);
});
