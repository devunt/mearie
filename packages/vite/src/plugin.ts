import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Plugin, ViteDevServer } from 'vite';
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
  let projectRoot: string;
  let mearieConfig: ResolvedMearieConfig;

  let context: CodegenContext;
  let generateTimer: NodeJS.Timeout | null = null;

  const ensureInitialized = async () => {
    if (context) return;

    const { config, cwd } = await loadConfig({
      filename: options.config,
    });

    projectRoot = cwd;
    mearieConfig = mergeConfig(config, options);

    const { schema, document, exclude, scalars } = mearieConfig;

    context = new CodegenContext(projectRoot);
    context.setConfig({ scalars });

    const schemaFiles = await findFiles(projectRoot, {
      include: schema,
      exclude,
    });

    const documentFiles = await findFiles(projectRoot, {
      include: document,
      exclude,
    });

    await Promise.all([
      ...schemaFiles.map((file) => context!.addSchema(file)),
      ...documentFiles.map((file) => context!.addDocument(file)),
    ]);
  };

  const scheduleGenerate = (server: ViteDevServer) => {
    if (generateTimer) {
      clearTimeout(generateTimer);
    }

    generateTimer = setTimeout(() => {
      void (async () => {
        try {
          await ensureInitialized();
          await context?.generate();

          const virtualModule = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
          if (virtualModule) {
            await server.reloadModule(virtualModule);
          }
        } catch (error) {
          report(logger, error);
        }
      })();
    }, 100);
  };

  return {
    name: 'mearie',
    enforce: 'pre',

    async configResolved(config) {
      try {
        await ensureInitialized();
        await context?.generate();
      } catch (error) {
        report(logger, error);

        if (config.command === 'build') {
          throw error;
        }
      }
    },

    async configureServer(server) {
      await ensureInitialized();

      const { schema, exclude } = mearieConfig;

      const schemaFiles = await findFiles(projectRoot, {
        include: schema,
        exclude,
      });

      for (const file of schemaFiles) {
        server.watcher.add(file);
      }
    },

    async hotUpdate({ file, type, server }) {
      await ensureInitialized();

      const { schema, document, exclude } = mearieConfig;
      const relativePath = path.relative(projectRoot, file);

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

        scheduleGenerate(server);
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
        const jsPath = path.join(projectRoot, '.mearie', 'graphql.js');
        try {
          return await readFile(jsPath, 'utf8');
        } catch {
          return 'export function graphql() { throw new Error("Mearie: graphql file not generated yet"); }';
        }
      }
    },
  };
};
