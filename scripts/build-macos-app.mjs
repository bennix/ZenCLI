import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const appName = pkg.build?.productName || pkg.name || 'app';
const bundleId = pkg.build?.appId || `com.example.${pkg.name || 'app'}`;
const version = pkg.version || '0.0.0';
const wantsDmg = process.argv.includes('--dmg');

const electronAppDir = path.join(rootDir, 'node_modules', 'electron', 'dist', 'Electron.app');
const releaseDir = path.join(rootDir, 'release', 'mac-arm64');
const appBundleDir = path.join(releaseDir, `${appName}.app`);
const appContentsDir = path.join(appBundleDir, 'Contents');
const resourcesDir = path.join(appContentsDir, 'Resources');
const runtimeAppDir = path.join(resourcesDir, 'app');
const mainPlist = path.join(appContentsDir, 'Info.plist');
const mainExecutable = path.join(appContentsDir, 'MacOS', 'Electron');
const renamedExecutable = path.join(appContentsDir, 'MacOS', appName);
const customIconName = `${appName}.icns`;
const customIconPath = path.join(rootDir, 'assets', 'icon', 'generated', customIconName);

function log(message) {
  console.log(`[build-macos-app] ${message}`);
}

function run(cmd, args, options = {}) {
  log(`${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });
}

function replacePlistString(plistPath, key, value) {
  execFileSync('plutil', ['-replace', key, '-string', value, plistPath], { stdio: 'inherit' });
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

function copyDir(src, dest, filter) {
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter,
  });
}

function copyRuntimePackage() {
  const runtimePackageJson = {
    name: pkg.name,
    version,
    description: pkg.description,
    type: pkg.type,
    main: pkg.main,
    dependencies: pkg.dependencies,
  };

  fs.writeFileSync(
    path.join(runtimeAppDir, 'package.json'),
    JSON.stringify(runtimePackageJson, null, 2) + '\n',
    'utf8',
  );
}

function copyCompiledApp() {
  const distSrc = path.join(rootDir, 'dist');
  const distDest = path.join(runtimeAppDir, 'dist');
  const vendorSrc = path.join(rootDir, 'vendor');
  const vendorDest = path.join(runtimeAppDir, 'vendor');

  ensureExists(distSrc, 'Compiled dist directory');
  ensureExists(vendorSrc, 'Vendor directory');

  copyDir(distSrc, distDest, (src) => {
    const rel = path.relative(distSrc, src);
    if (!rel) return true;
    if (rel === 'builder-debug.yml') return false;
    if (rel.startsWith('win-unpacked')) return false;
    if (rel.endsWith('.exe')) return false;
    return true;
  });

  copyDir(vendorSrc, vendorDest);
}

function copyProductionNodeModules() {
  const output = execFileSync(
    'npm',
    ['ls', '--omit=dev', '--all', '--parseable'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  const deps = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((dir) => dir !== rootDir);

  for (const depDir of deps) {
    const rel = path.relative(rootDir, depDir);
    const dest = path.join(runtimeAppDir, rel);
    copyDir(depDir, dest);
  }
}

function renameMainApp() {
  fs.renameSync(mainExecutable, renamedExecutable);
  replacePlistString(mainPlist, 'CFBundleDisplayName', appName);
  replacePlistString(mainPlist, 'CFBundleExecutable', appName);
  replacePlistString(mainPlist, 'CFBundleIdentifier', bundleId);
  replacePlistString(mainPlist, 'CFBundleName', appName);
  replacePlistString(mainPlist, 'CFBundleShortVersionString', version);
  replacePlistString(mainPlist, 'CFBundleVersion', version);
}

function renameHelperApp(oldName, newName, helperBundleId) {
  const helpersDir = path.join(appContentsDir, 'Frameworks');
  const oldAppDir = path.join(helpersDir, `${oldName}.app`);
  const newAppDir = path.join(helpersDir, `${newName}.app`);
  const oldExec = path.join(oldAppDir, 'Contents', 'MacOS', oldName);
  const newExec = path.join(oldAppDir, 'Contents', 'MacOS', newName);
  const plistPath = path.join(oldAppDir, 'Contents', 'Info.plist');

  if (!fs.existsSync(oldAppDir)) return;

  fs.renameSync(oldExec, newExec);
  replacePlistString(plistPath, 'CFBundleDisplayName', newName);
  replacePlistString(plistPath, 'CFBundleExecutable', newName);
  replacePlistString(plistPath, 'CFBundleIdentifier', helperBundleId);
  replacePlistString(plistPath, 'CFBundleName', newName);
  fs.renameSync(oldAppDir, newAppDir);
}

function renameHelpers() {
  renameHelperApp('Electron Helper', `${appName} Helper`, `${bundleId}.helper`);
  renameHelperApp('Electron Helper (GPU)', `${appName} Helper (GPU)`, `${bundleId}.helper.gpu`);
  renameHelperApp('Electron Helper (Plugin)', `${appName} Helper (Plugin)`, `${bundleId}.helper.plugin`);
  renameHelperApp('Electron Helper (Renderer)', `${appName} Helper (Renderer)`, `${bundleId}.helper.renderer`);
}

function removeDefaultApp() {
  fs.rmSync(path.join(resourcesDir, 'default_app.asar'), { force: true });
  fs.rmSync(path.join(resourcesDir, 'app.asar'), { force: true });
}

function buildCustomIcon() {
  run('node', [path.join('scripts', 'build-macos-icon.mjs')]);
  ensureExists(customIconPath, 'Generated app icon');
}

function applyCustomIcon() {
  const bundledIconPath = path.join(resourcesDir, customIconName);
  fs.copyFileSync(customIconPath, bundledIconPath);
  replacePlistString(mainPlist, 'CFBundleIconFile', customIconName);
}

function prepareBundle() {
  ensureExists(electronAppDir, 'Electron.app');
  buildCustomIcon();

  fs.rmSync(releaseDir, { recursive: true, force: true });
  fs.mkdirSync(releaseDir, { recursive: true });
  run('ditto', [electronAppDir, appBundleDir]);

  renameMainApp();
  renameHelpers();
  removeDefaultApp();
  applyCustomIcon();

  fs.mkdirSync(runtimeAppDir, { recursive: true });
  copyRuntimePackage();
  copyCompiledApp();
  copyProductionNodeModules();
}

function signBundle() {
  run('xattr', ['-cr', appBundleDir]);
  run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', appBundleDir]);
}

function buildDmg() {
  const dmgPath = path.join(rootDir, 'release', `${appName}-${version}-macos-arm64.dmg`);
  fs.rmSync(dmgPath, { force: true });
  run('hdiutil', [
    'create',
    '-volname', appName,
    '-srcfolder', appBundleDir,
    '-ov',
    '-format', 'UDZO',
    dmgPath,
  ]);
  log(`Created DMG: ${dmgPath}`);
}

function main() {
  prepareBundle();
  signBundle();
  if (wantsDmg) {
    buildDmg();
  }
  log(`Created app bundle: ${appBundleDir}`);
}

try {
  main();
} catch (error) {
  console.error(`[build-macos-app] ${(error && error.message) || error}`);
  process.exit(1);
}
