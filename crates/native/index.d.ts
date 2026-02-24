export interface SourceBuf {
  code: string;
  filePath: string;
  startLine: number;
}

export interface ExtractGraphQLSourcesResult {
  sources: SourceBuf[];
  errors: unknown[];
}

export interface GenerateCodeConfig {
  scalars?: Record<string, string>;
}

export interface GenerateCodeResult {
  sources: SourceBuf[];
  errors: unknown[];
}

export declare function extractGraphQLSources(source: SourceBuf): ExtractGraphQLSourcesResult;
export declare function generateCode(
  schemas: SourceBuf[],
  documents: SourceBuf[],
  config?: GenerateCodeConfig | null,
): GenerateCodeResult;
