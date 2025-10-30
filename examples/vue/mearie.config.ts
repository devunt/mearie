import { defineConfig } from 'mearie';

export default defineConfig({
  schema: '../../fixture/schema.graphql',
  scalars: {
    DateTime: 'Date',
    URL: 'string',
  },
});
