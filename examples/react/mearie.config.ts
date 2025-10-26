import { defineConfig } from 'mearie';

export default defineConfig({
  schema: '../../fixture/schema.graphql',
  scalars: {
    DateTime: 'Date',
    Date: 'string',
    URL: 'string',
  },
});
