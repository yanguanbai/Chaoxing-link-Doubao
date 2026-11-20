// 检查文档里的安装链接与脚本元数据是否自洽：链接指向的文件必须真实存在。
// 用法：node tools/check-docs.mjs
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
const RAW_BASE = 'https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/';
let errors = 0;

function fail(msg) {
  console.error(msg);
  errors += 1;
}

const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
const docs = tracked.filter((f) => f.endsWith('.md'));

// 1. 文档中的 raw 链接必须指向仓库里存在的文件
const LINK_RE = /https:\/\/raw\.githubusercontent\.com\/yanguanbai\/Chaoxing-link-Doubao\/main\/([^\s`")'<>]+)/g;
for (const doc of docs) {
  const text = fs.readFileSync(path.join(root, doc), 'utf8');
  for (const m of text.matchAll(LINK_RE)) {
    const target = decodeURIComponent(m[1]).replace(/\.$/, '');
    if (!fs.existsSync(path.join(root, target))) {
      fail(`${doc}: 链接指向不存在的文件 ${target}`);
    }
  }
}

// 2. 每个脚本目录都要有中文与英文说明，元数据里的更新地址要指向自身
const srcDirs = fs.readdirSync(path.join(root, 'src'), { withFileTypes: true }).filter((d) => d.isDirectory());
for (const dir of srcDirs) {
  const dirPath = path.join(root, 'src', dir.name);
  for (const need of ['README.md', 'README.en.md']) {
    if (!fs.existsSync(path.join(dirPath, need))) fail(`src/${dir.name}: 缺少 ${need}`);
  }
  const scripts = fs.readdirSync(dirPath).filter((f) => f.endsWith('.user.js'));
  if (!scripts.length) fail(`src/${dir.name}: 没有 .user.js`);
  for (const f of scripts) {
    const head = fs.readFileSync(path.join(dirPath, f), 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
    const expect = `${RAW_BASE}src/${dir.name}/${f}`;
    for (const key of ['@downloadURL', '@updateURL']) {
      const m = head.match(new RegExp(`^\\s*//\\s*${key}\\s+(\\S+)`, 'm'));
      if (!m) {
        fail(`src/${dir.name}/${f}: 缺少 ${key}`);
        continue;
      }
      if (m[1].trim() !== expect) fail(`src/${dir.name}/${f}: ${key} 应为 ${expect}，实际 ${m[1].trim()}`);
    }
  }
}

// 3. 文档里不应出现制表符，避免表格渲染错乱
for (const doc of docs) {
  if (fs.readFileSync(path.join(root, doc), 'utf8').includes('\t')) fail(`${doc}: 含有制表符`);
}

if (errors) {
  console.error(`\n共 ${errors} 个问题`);
  process.exit(1);
}
console.log(`文档链接与脚本元数据一致（${docs.length} 个文档）`);
