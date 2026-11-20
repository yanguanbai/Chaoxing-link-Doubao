// 用各脚本自身声明的 @version 回填根 README 表格里的版本列，避免手写版本号不及时更新。
// 用法：node tools/sync-readme-versions.mjs [--check]
//   --check  只检查不写文件，有差异时 exit 1（给 CI 用）
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const root = repoRoot();
const checkOnly = process.argv.includes('--check');
const READMES = ['README.md', 'README.en.md'];
const VERSION_CELL = /^\s*v?\d+\.\d+\.\d+\s*$/;

// 收集 src/*/*.user.js 的 @version
const srcDir = path.join(root, 'src');
const scripts = new Map(); // 文件名 -> 版本
for (const dir of fs.readdirSync(srcDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(srcDir, dir.name))) {
    if (!f.endsWith('.user.js')) continue;
    const head = fs.readFileSync(path.join(srcDir, dir.name, f), 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
    const m = head.match(/^\s*\/\/\s*@version\s+(\S+)/m);
    if (!m) {
      console.error(`${f}: 找不到 @version，跳过`);
      continue;
    }
    scripts.set(f, m[1]);
  }
}

if (!scripts.size) {
  console.error('没有找到任何 .user.js 脚本');
  process.exit(1);
}

let changedFiles = 0;
let staleCells = 0;

for (const name of READMES) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  let out = 0;
  const lines = raw.split(/\r?\n/).map((line) => {
    if (!line.trimStart().startsWith('|')) return line;
    const hit = [...scripts.keys()].find((s) => line.includes(s));
    if (!hit) return line;
    const want = scripts.get(hit);
    const cells = line.split('|');
    for (let i = 1; i < cells.length - 1; i += 1) {
      if (!VERSION_CELL.test(cells[i])) continue;
      if (cells[i].trim() === want) return line;
      cells[i] = ` ${want} `;
      staleCells += 1;
      out = 1;
      return cells.join('|');
    }
    console.error(`${name}: ${hit} 所在行没找到版本格`);
    return line;
  });
  const text = lines.join(eol);
  if (out) {
    changedFiles += 1;
    if (checkOnly) {
      console.error(`${name}: 版本列与脚本 @version 不一致`);
    } else {
      fs.writeFileSync(file, text, 'utf8');
      console.log(`${name}: 已更新 ${staleCells} 处版本号`);
    }
  }
}

if (!changedFiles) {
  console.log(`版本列与脚本 @version 一致（${scripts.size} 个脚本）`);
  process.exit(0);
}
process.exit(checkOnly ? 1 : 0);
