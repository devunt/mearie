import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prettier from 'prettier';
import { glob } from 'tinyglobby';

type Pkg = Record<string, unknown> & {
  repository?: { type: string; url: string; directory?: string };
};

const root = path.resolve(import.meta.dirname, '..');
const rootPkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as Pkg;
const yaml = await readFile(`${root}/pnpm-workspace.yaml`, 'utf8');
const patterns = yaml
  .split('\n')
  .filter((line) => line.trim().startsWith('- '))
  .map((line) => `${line.replace(/^\s*-\s*/, '').trim()}/package.json`);

const fields = ['description', 'keywords', 'homepage', 'bugs', 'funding', 'license', 'author', 'engines'];

const sync = async (pkgPath: string) => {
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as Pkg;
  const dir = path.relative(root, path.dirname(pkgPath));

  if (pkg.private) return;

  for (const field of fields) {
    if (rootPkg[field]) {
      pkg[field] = rootPkg[field];
    }
  }

  if (rootPkg.repository) {
    pkg.repository = { ...rootPkg.repository, directory: dir };
  }

  const content = JSON.stringify(pkg, null, 2) + '\n';
  const config = await prettier.resolveConfig(pkgPath);
  const formatted = await prettier.format(content, { ...config, filepath: pkgPath });
  await writeFile(pkgPath, formatted);
  console.log(`✓ ${pkgPath}`);
};

const files = await glob(patterns, { cwd: root, absolute: true });
await Promise.all(files.map((file) => sync(file)));
