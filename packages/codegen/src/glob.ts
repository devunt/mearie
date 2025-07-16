import { glob } from 'tinyglobby';
import picomatch from 'picomatch';

export type GlobPatterns = {
  include: string | string[];
  exclude?: string | string[];
};

/**
 * Finds files matching the given patterns.
 * @param cwd - Current working directory.
 * @param patterns - File patterns to match.
 * @returns Array of absolute file paths.
 */
export const findFiles = async (cwd: string, patterns: GlobPatterns): Promise<string[]> => {
  const includePatterns = Array.isArray(patterns.include) ? patterns.include : [patterns.include];
  const excludePatterns = patterns.exclude
    ? Array.isArray(patterns.exclude)
      ? patterns.exclude
      : [patterns.exclude]
    : [];
  const negatedExcludes = excludePatterns.map((pattern) => `!${pattern}`);

  return await glob([...includePatterns, ...negatedExcludes], {
    cwd,
    absolute: true,
  });
};

/**
 * Creates a matcher function.
 * @internal
 * @param patterns - File patterns to match.
 * @returns A function that checks if a file path matches the patterns.
 */
export const createMatcher = (patterns: GlobPatterns): ((filePath: string) => boolean) => {
  const includePatterns = Array.isArray(patterns.include) ? patterns.include : [patterns.include];
  const excludePatterns = patterns.exclude
    ? Array.isArray(patterns.exclude)
      ? patterns.exclude
      : [patterns.exclude]
    : [];

  const isMatch = picomatch(includePatterns);
  const isExcluded = excludePatterns.length > 0 ? picomatch(excludePatterns) : (): boolean => false;

  return (filePath: string): boolean => {
    return isMatch(filePath) && !isExcluded(filePath);
  };
};
