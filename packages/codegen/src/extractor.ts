import { extractGraphQLSources as extractGraphQLSourcesNative } from '@mearie/native';
import { MearieError } from './errors.ts';
import { extractAstroScripts, extractMarkdownCodeBlocks, extractSvelteScript, extractVueScript } from './parsers.ts';
import type { Source } from './types.ts';

type ExtractGraphQLSourcesResult = {
  sources: Source[];
  errors: MearieError[];
};

export const extractGraphQLSources = async (source: Source): Promise<ExtractGraphQLSourcesResult> => {
  const ext = source.filePath.split('.').pop()?.toLowerCase();

  const sources: Source[] = [];
  const errors: MearieError[] = [];

  const blocks: Source[] = [];

  try {
    switch (ext) {
      case 'vue': {
        blocks.push(...(await extractVueScript(source)));
        break;
      }
      case 'svelte': {
        blocks.push(...(await extractSvelteScript(source)));
        break;
      }
      case 'astro': {
        blocks.push(...extractAstroScripts(source));
        break;
      }
      case 'md': {
        blocks.push(...extractMarkdownCodeBlocks(source));
        break;
      }
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx': {
        blocks.push(source);
        break;
      }
      default: {
        return { sources, errors };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new MearieError(message, source.filePath);
  }

  for (const block of blocks) {
    const result = extractGraphQLSourcesNative(block);
    sources.push(...result.sources);
    errors.push(...result.errors.map((error) => MearieError.fromNative(error)));
  }

  return { sources, errors };
};
