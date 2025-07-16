/**
 * Configuration for the code generator.
 */
export type CodegenConfig = {
  schemas: string;
  documents: string | string[];
  exclude?: string | string[];
  cwd: string;
};
