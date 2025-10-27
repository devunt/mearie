import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Plugin, ResolvedConfig } from 'vite';
import { loadConfig, mergeConfig, type ResolvedMearieConfig } from '@mearie/config';
import { CodegenContext, createMatcher, findFiles, logger, report } from '@mearie/codegen';
import type { MearieOptions } from './types.ts';

const VIRTUAL_MODULE_ID = '$mearie';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/**
 * Vite plugin for Mearie GraphQL code generation.
 * @param options - Plugin options.
 * @returns Vite plugin.
 */
export const mearie = (options: MearieOptions = {}): Plugin => {
  let viteConfig: ResolvedConfig;
  let mearieConfig: ResolvedMearieConfig;

  let context: CodegenContext | null = null;
  let generateTimer: NodeJS.Timeout | null = null;

  const ensureInitialized = async () => {
    if (context) return;

    const baseConfig = await loadConfig({
      cwd: viteConfig.root,
      filename: options.config,
    });

    mearieConfig = mergeConfig(baseConfig, options);

    const { schema, document, exclude } = mearieConfig;

    context = new CodegenContext(viteConfig.root);

    const schemaFiles = await findFiles(viteConfig.root, {
      include: schema,
      exclude,
    });

    const documentFiles = await findFiles(viteConfig.root, {
      include: document,
      exclude,
    });

    await Promise.all([
      ...schemaFiles.map((file) => context!.addSchema(file)),
      ...documentFiles.map((file) => context!.addDocument(file)),
    ]);
  };

  const scheduleGenerate = () => {
    if (generateTimer) {
      clearTimeout(generateTimer);
    }

    generateTimer = setTimeout(() => {
      void (async () => {
        try {
          await context?.generate();
        } catch (error) {
          report(logger, error);
        }
      })();
    }, 100);
  };

  return {
    name: 'mearie',
    enforce: 'pre',

    async configResolved(resolvedConfig) {
      viteConfig = resolvedConfig;

      try {
        await ensureInitialized();
        await context?.generate();
      } catch (error) {
        report(logger, error);

        if (viteConfig.command === 'build') {
          throw error;
        }
      }
    },

    async hotUpdate({ file, type }) {
      if (!context || !mearieConfig) {
        return;
      }

      const { schema, document, exclude } = mearieConfig;
      const relativePath = path.relative(viteConfig.root, file);

      const schemaMatcher = createMatcher({
        include: schema,
        exclude,
      });

      const documentMatcher = createMatcher({
        include: document,
        exclude,
      });

      const matchesSchema = schemaMatcher(relativePath);
      const matchesDocument = documentMatcher(relativePath);

      if (!matchesSchema && !matchesDocument) {
        return;
      }

      try {
        if (type === 'delete') {
          if (matchesSchema) {
            context.removeSchema(file);
          }

          if (matchesDocument) {
            context.removeDocument(file);
          }
        } else {
          if (matchesSchema) {
            await context.addSchema(file);
          }

          if (matchesDocument) {
            await context.addDocument(file);
          }
        }

        scheduleGenerate();
      } catch (error) {
        report(logger, error);
      }
    },
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        const jsPath = path.join(viteConfig.root, '.mearie', 'graphql.js');
        try {
          return await readFile(jsPath, 'utf8');
        } catch {
          return 'export function graphql() { throw new Error("Mearie: graphql file not generated yet"); }';
        }
      }
    },
  };
};
