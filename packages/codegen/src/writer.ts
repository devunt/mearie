import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Source } from './types.ts';

export const writeFiles = async (cwd: string, sources: Source[]): Promise<void> => {
  const mearieDir = path.resolve(cwd, '.mearie');

  await mkdir(mearieDir, { recursive: true });

  // Write generated files (graphql.js, graphql.d.ts, types.d.ts)
  await Promise.all(sources.map((source) => writeFile(path.join(mearieDir, source.filePath), source.code, 'utf8')));
};
