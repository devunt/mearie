import { documentMap } from './.mearie/client/documents.js';

export const graphql = (document) => {
  return documentMap[document];
};
