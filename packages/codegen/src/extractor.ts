import {
  extractGraphQLSources as extractGraphQLSourcesNative,
  extractGraphQLSourcesFromDocuments as extractGraphQLSourcesFromDocumentsNative,
} from '@mearie/native';
import { MearieError } from './errors.ts';
import { extractAstroScripts, extractMarkdownCodeBlocks, extractSvelteScript, extractVueScript } from './parsers.ts';
import type { Source } from './types.ts';

type ExtractGraphQLSourcesResult = {
  sources: Source[];
  errors: MearieError[];
};

const extractGraphQLSourceBlocks = async (source: Source): Promise<Source[]> => {
  const ext = source.filePath.split('.').pop()?.toLowerCase();

  try {
    switch (ext) {
      case 'vue': {
        return extractVueScript(source);
      }
      case 'svelte': {
        return extractSvelteScript(source);
      }
      case 'astro': {
        return extractAstroScripts(source);
      }
      case 'md': {
        return extractMarkdownCodeBlocks(source);
      }
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx': {
        return [source];
      }
      default: {
        return [];
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MearieError(message, source.filePath);
  }
};

export const extractGraphQLSources = async (source: Source): Promise<ExtractGraphQLSourcesResult> => {
  const sources: Source[] = [];
  const errors: MearieError[] = [];

  const blocks = await extractGraphQLSourceBlocks(source);

  for (const block of blocks) {
    const result = extractGraphQLSourcesNative(block);
    sources.push(...result.sources);
    errors.push(...result.errors.map((error) => MearieError.fromNative(error)));
  }

  return { sources, errors };
};

export const extractGraphQLSourcesFromDocuments = async (documents: Source[]): Promise<ExtractGraphQLSourcesResult> => {
  const documentBlocks = await Promise.all(documents.map((document) => extractGraphQLSourceBlocks(document)));
  const blocks = documentBlocks.flat();
  const result = extractGraphQLSourcesFromDocumentsNative(blocks);

  return {
    sources: result.sources,
    errors: result.errors.map((error) => MearieError.fromNative(error)),
  };
};
