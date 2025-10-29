import { loadConfig as c12LoadConfig } from 'c12';
import type { MearieConfig, ResolvedMearieConfig } from './types.ts';
import { mearieConfigSchema } from './schema.ts';
import { mergeConfig } from './merge.ts';
import { defaultResolvedMearieConfig } from './defaults.ts';

export type LoadConfigOptions = {
  filename?: string;
};

export const loadConfig = async (
  options: LoadConfigOptions = {},
): Promise<{ config: ResolvedMearieConfig; cwd: string }> => {
  const { config, cwd } = await c12LoadConfig<MearieConfig>({
    name: 'mearie',
    configFile: options.filename,
  });

  const parsed = mearieConfigSchema.parse(config ?? {});
  return {
    config: mergeConfig(defaultResolvedMearieConfig, parsed),
    cwd: cwd ?? process.cwd(),
  };
};
