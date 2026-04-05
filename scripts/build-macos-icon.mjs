import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const appName = pkg.build?.productName || pkg.name || 'app';
const sourceSvg = path.join(rootDir, 'assets', 'icon', 'zen-cli.svg');
const outputDir = path.join(rootDir, 'assets', 'icon', 'generated');
const outputPng = path.join(outputDir, `${appName}.png`);
const outputIcns = path.join(outputDir, `${appName}.icns`);

function log(message) {
  console.log(`[build-macos-icon] ${message}`);
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

function run(cmd, args, options = {}) {
  log(`${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {
    cwd: rootDir,
    stdio: 'pipe',
    ...options,
  });
}

function renderMasterPng(tempDir) {
  run('qlmanage', ['-t', '-s', '1024', '-o', tempDir, sourceSvg]);
  const renderedPng = path.join(tempDir, `${path.basename(sourceSvg)}.png`);
  ensureExists(renderedPng, 'Rendered master PNG');
  fs.copyFileSync(renderedPng, outputPng);
}

function createIconset(tempDir) {
  const iconsetDir = path.join(tempDir, 'zen-cli.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  const variants = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  for (const [filename, size] of variants) {
    run('sips', ['-z', String(size), String(size), outputPng, '--out', path.join(iconsetDir, filename)]);
  }

  return iconsetDir;
}

function main() {
  ensureExists(sourceSvg, 'Source icon SVG');
  fs.mkdirSync(outputDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zen-cli-icon-'));
  try {
    renderMasterPng(tempDir);
    const iconsetDir = createIconset(tempDir);
    run('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcns]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  log(`Generated PNG: ${outputPng}`);
  log(`Generated ICNS: ${outputIcns}`);
}

try {
  main();
} catch (error) {
  console.error(`[build-macos-icon] ${(error && error.message) || error}`);
  process.exit(1);
}
