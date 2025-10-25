import { createYoga } from 'graphql-yoga';
import { schema } from '@mearie-internal/fixture';

const yoga = createYoga({
  schema,
  landingPage: false,
});

export default {
  fetch: yoga,
};
