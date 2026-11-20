// 校验 src/*/*.user.js 的用户脚本元数据：必需字段齐全、@version 为 x.y.z。
// 用法：node tools/check-userscript-meta.mjs
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
const REQUIRED = ['@name', '@version', '@license', '@downloadURL', '@updateURL', '@match'];
let errors = 0;

const srcDir = path.join(root, 'src');
for (const dir of fs.readdirSync(srcDir, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(srcDir, dir.name))) {
    if (!f.endsWith('.user.js')) continue;
    const file = path.join(srcDir, dir.name, f);
    const head = fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(0, 40).join('\n');
    for (const key of REQUIRED) {
      // 形如 `// @name   xxx`：允许任意缩进与至少一个空白
      const re = new RegExp(`^\\s*//\\s*${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s+\\S`, 'm');
      if (!re.test(head)) {
        console.error(`${file}: 缺少或不合法 ${key}`);
        errors += 1;
      }
    }
    const m = head.match(/^\s*\/\/\s*@version\s+(\S+)/m);
    if (!m) {
      console.error(`${file}: 找不到 @version`);
      errors += 1;
    } else if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m[1])) {
      console.error(`${file}: @version 不是 x.y.z（实际 ${m[1]}）`);
      errors += 1;
    }
  }
}

if (errors) {
  console.error(`\n共 ${errors} 个元数据问题`);
  process.exit(1);
}
console.log('用户脚本元数据校验通过');
