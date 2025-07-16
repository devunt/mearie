import { loadSvelteCompiler, loadTypeScript, loadVueCompiler } from './loaders.ts';
import type { Source } from '@mearie/core';

export const extractVueScript = async (source: Source): Promise<Source[]> => {
  const [vueCompiler, typescript] = await Promise.all([loadVueCompiler(), loadTypeScript()]);

  vueCompiler.registerTS(() => typescript);

  const { descriptor } = vueCompiler.parse(source.code, { filename: source.filePath });

  if (!descriptor.script && !descriptor.scriptSetup) {
    return [];
  }

  const code = vueCompiler.compileScript(descriptor, { id: Date.now().toString() }).content;
  return [{ ...source, code }];
};

export const extractSvelteScript = async (source: Source): Promise<Source[]> => {
  const svelte = await loadSvelteCompiler();

  const ast = svelte.parse(source.code) as {
    instance?: { content: { start: number; end: number } };
    module?: { content: { start: number; end: number } };
  };

  const blocks: Source[] = [];

  if (ast.instance?.content) {
    const code = source.code.slice(ast.instance.content.start, ast.instance.content.end);
    const beforeBlock = source.code.slice(0, ast.instance.content.start);
    const lineOffset = beforeBlock.split('\n').length - 1;

    blocks.push({
      code,
      filePath: `${source.filePath}.instance.ts`,
      startLine: source.startLine + lineOffset,
    });
  }

  if (ast.module?.content) {
    const code = source.code.slice(ast.module.content.start, ast.module.content.end);
    const beforeBlock = source.code.slice(0, ast.module.content.start);
    const lineOffset = beforeBlock.split('\n').length - 1;

    blocks.push({
      code,
      filePath: `${source.filePath}.module.ts`,
      startLine: source.startLine + lineOffset,
    });
  }

  return blocks;
};

export const extractAstroScripts = (source: Source): Source[] => {
  const blocks: Source[] = [];

  const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---/.exec(source.code);

  if (frontmatterMatch) {
    const beforeMatch = source.code.slice(0, frontmatterMatch.index);
    const lineOffset = beforeMatch.split('\n').length;

    blocks.push({
      code: frontmatterMatch[1]!,
      filePath: `${source.filePath}.frontmatter.ts`,
      startLine: source.startLine + lineOffset,
    });
  }

  const scriptMatches = source.code.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
  let index = 0;

  for (const match of scriptMatches) {
    const beforeMatch = source.code.slice(0, match.index);
    const lineOffset = beforeMatch.split('\n').length;

    blocks.push({
      code: match[1]!,
      filePath: `${source.filePath}.${index}.ts`,
      startLine: source.startLine + lineOffset,
    });

    index++;
  }

  return blocks;
};

export const extractMarkdownCodeBlocks = (source: Source): Source[] => {
  const codeBlocks: Source[] = [];
  const codeBlockRegex = /```(tsx|ts)[^\n]*mearie[^\n]*\n([\s\S]*?)```/g;

  let match;
  let index = 0;

  while ((match = codeBlockRegex.exec(source.code)) !== null) {
    const beforeMatch = source.code.slice(0, match.index);
    const lineOffset = beforeMatch.split('\n').length;

    codeBlocks.push({
      code: match[2]!,
      filePath: `${source.filePath}.${index}.${match[1]}`,
      startLine: source.startLine + lineOffset,
    });

    index++;
  }

  return codeBlocks;
};
