import { loadConfig as c12LoadConfig } from 'c12';
import type { MearieConfig, ResolvedMearieConfig } from './types.ts';
import { mearieConfigSchema } from './schema.ts';
import { mergeConfig } from './merge.ts';
import { defaultResolvedMearieConfig } from './defaults.ts';

export type LoadConfigOptions = {
  cwd?: string;
  filename?: string;
};

export const loadConfig = async (options: LoadConfigOptions = {}): Promise<ResolvedMearieConfig> => {
  const { config } = await c12LoadConfig<MearieConfig>({
    name: 'mearie',
    cwd: options.cwd,
    configFile: options.filename,
  });

  const parsed = mearieConfigSchema.parse(config ?? {});
  return mergeConfig(defaultResolvedMearieConfig, parsed);
};
