import { readFile } from 'node:fs/promises';
import { extractGraphQLSources } from '@mearie/extractor';
import { MearieAggregateError, type Source } from '@mearie/core';
import { generate } from './generator.ts';
import { writeFiles } from './writer.ts';

/**
 * Stateful context for incremental code generation.
 * Reads and caches file contents when files are added/updated.
 */
export class CodegenContext {
  private schemas = new Map<string, Source>();
  private documents = new Map<string, Source[]>();

  /**
   * Adds a schema file by reading it.
   * @param filePath - Schema file path.
   */
  async addSchema(filePath: string): Promise<void> {
    const code = await readFile(filePath, 'utf8');
    this.schemas.set(filePath, { code, filePath, startLine: 1 });
  }

  /**
   * Removes a schema file.
   * @param filePath - Schema file path.
   */
  removeSchema(filePath: string): void {
    this.schemas.delete(filePath);
  }

  /**
   * Adds a document file by reading and extracting operations.
   * @param filePath - Document file path.
   */
  async addDocument(filePath: string): Promise<void> {
    const code = await readFile(filePath, 'utf8');
    const { sources, errors } = await extractGraphQLSources({ code, filePath, startLine: 1 });

    this.documents.set(filePath, sources);

    if (errors.length > 0) {
      throw new MearieAggregateError(errors);
    }
  }

  /**
   * Removes a document file.
   * @param filePath - Document file path.
   */
  removeDocument(filePath: string): void {
    this.documents.delete(filePath);
  }

  /**
   * Generates code from cached schemas and documents and writes to files.
   * @returns Written file paths.
   * @throws {Error} If generation or writing fails.
   */
  async generate(): Promise<void> {
    const schemas = [...this.schemas.values()];
    const documents = [...this.documents.values()].flat();

    const { sources, errors } = generate({ schemas, documents });

    await writeFiles(sources);

    if (errors.length > 0) {
      throw new MearieAggregateError(errors);
    }
  }
}
