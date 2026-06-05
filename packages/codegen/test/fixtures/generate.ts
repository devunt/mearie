import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCode } from '@mearie/native';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const generatedDir = path.join(fixtureDir, '__generated__');

export const generateFixture = async (): Promise<void> => {
  const schema = await readFile(path.join(fixtureDir, 'schema.graphql'), 'utf8');

  const result = generateCode([{ code: schema, filePath: 'schema.graphql', startLine: 1 }], [], {
    scalars: { URL: 'URL' },
  });

  if (result.errors.length > 0) {
    throw new Error(`Failed to generate fixture:\n${JSON.stringify(result.errors, null, 2)}`);
  }

  await mkdir(generatedDir, { recursive: true });

  await Promise.all(
    result.sources
      .filter((source) => source.filePath.endsWith('.d.ts'))
      .map((source) => writeFile(path.join(generatedDir, source.filePath), source.code)),
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await generateFixture();
}
