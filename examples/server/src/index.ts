import { createYoga } from 'graphql-yoga';
import { schema } from '@mearie/fixture';

const yoga = createYoga({
  schema,
  landingPage: false,
});

export default {
  fetch: yoga,
};
