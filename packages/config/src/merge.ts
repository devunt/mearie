import type { MearieConfig, ResolvedMearieConfig } from './types.ts';

/**
 * Merges base configuration with override configuration.
 * @param base - Base configuration.
 * @param override - Override configuration.
 * @returns Merged configuration where override values replace base values for schemas and documents,
 * exclude arrays are concatenated, and scalars are merged.
 */
export const mergeConfig = (base: ResolvedMearieConfig, override: Partial<MearieConfig>): ResolvedMearieConfig => {
  const baseExclude = Array.isArray(base.exclude) ? base.exclude : [base.exclude];
  const overrideExclude = override.exclude
    ? Array.isArray(override.exclude)
      ? override.exclude
      : [override.exclude]
    : [];

  return {
    schema: override.schema ?? base.schema,
    document: override.document ?? base.document,
    exclude: [...baseExclude, ...overrideExclude],
    scalars: {
      ...base.scalars,
      ...override.scalars,
    },
  };
};
