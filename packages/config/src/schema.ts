import { z } from 'zod';
import type { MearieConfig } from './types.ts';

export const mearieConfigSchema: z.ZodType<MearieConfig> = z.object({
  schema: z.union([z.string(), z.array(z.string())]).optional(),
  document: z.union([z.string(), z.array(z.string())]).optional(),
  exclude: z.union([z.string(), z.array(z.string())]).optional(),
  scalars: z.record(z.string(), z.string()).optional(),
});
