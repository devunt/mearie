#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';
import { loadConfig } from '@mearie/config';
import { CodegenContext, findFiles, logger, report } from '@mearie/codegen';

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate TypeScript types from GraphQL operations',
  },
  args: {
    config: {
      type: 'string',
      description: 'Path to config file',
      alias: 'c',
    },
  },
  async run({ args }) {
    try {
      const { config, cwd } = await loadConfig({
        filename: args.config,
      });

      const { schema, document, exclude, scalars } = config;

      const context = new CodegenContext(cwd);
      context.setConfig({ scalars });

      logger.info('Finding schema and document files...');

      const schemaFiles = await findFiles(cwd, {
        include: schema,
        exclude,
      });

      const documentFiles = await findFiles(cwd, {
        include: document,
        exclude,
      });

      logger.info(`Found ${schemaFiles.length} schema file(s)`);
      logger.info(`Found ${documentFiles.length} document file(s)`);

      await Promise.all([
        ...schemaFiles.map((file) => context.addSchema(file)),
        ...documentFiles.map((file) => context.addDocument(file)),
      ]);

      logger.info('Generating code...');
      await context.generate();

      logger.info('✓ Code generation complete!');
    } catch (error) {
      report(logger, error);
      process.exit(1);
    }
  },
});

const main = defineCommand({
  meta: {
    name: 'mearie',
    description: 'Mearie GraphQL CLI',
  },
  subCommands: {
    generate,
  },
});

void runMain(main);
