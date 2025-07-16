export type MearieConfig = {
  /**
   * Path to the GraphQL schema file(s).
   * @default "schema.graphql"
   */
  schema?: string | string[];

  /**
   * GraphQL documents to include (queries, mutations, fragments).
   * @default "**\/*"
   */
  document?: string | string[];

  /**
   * Glob patterns to exclude from document scanning.
   * Specified patterns are added to the default exclude list.
   * @default ["**\/node_modules\/**", "**\/dist\/**"]
   */
  exclude?: string | string[];

  /**
   * Custom scalar type mappings.
   * @default { ID: "string", String: "string", Int: "number", Float: "number", Boolean: "boolean" }
   */
  scalars?: Record<string, string>;
};

export type ResolvedMearieConfig = Required<MearieConfig>;
