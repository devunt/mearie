import type { MearieConfig } from '@mearie/config';

/**
 * Options for the Mearie Vite plugin.
 * All options are optional and will override values from mearie.config.ts.
 */
export type MearieOptions = Partial<MearieConfig> & {
  /**
   * Path to the Mearie configuration file.
   * @default "mearie.config.{ts,js,mjs,cjs}"
   */
  config?: string;
};
