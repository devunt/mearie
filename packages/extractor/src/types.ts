export type ExtractedDocument = {
  source: string;
  filePath: string;
  line?: number;
};

export type ExtractionError = {
  InterpolationNotAllowed?: {
    file_path: string;
    line: number;
  };
  JavaScriptParseError?: {
    file_path: string;
    message: string;
  };
};

export type ExtractionResult = {
  documents: {
    source: string;
    file_path: string;
    line: number | null;
  }[];
  errors: ExtractionError[];
};
