import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Source } from './types.ts';

export const writeFiles = async (sources: Source[]): Promise<void> => {
  const requireFromCwd = createRequire(path.resolve(process.cwd(), 'package.json'));
  const clientPackageJsonPath = requireFromCwd.resolve('@mearie/client/package.json');
  const meariePackagePath = path.dirname(clientPackageJsonPath);
  const clientDir = path.resolve(meariePackagePath, '.mearie', 'client');

  await mkdir(clientDir, { recursive: true });

  await Promise.all(sources.map((source) => writeFile(path.join(clientDir, source.filePath), source.code, 'utf8')));
};
