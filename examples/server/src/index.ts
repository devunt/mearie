import { createYoga } from 'graphql-yoga';
import { schema, seedReviews } from '@mearie-internal/fixture';

const yoga = createYoga({
  schema,
  landingPage: false,
});

let initialized = false;

export default {
  fetch(request: Request) {
    if (!initialized) {
      seedReviews();
      initialized = true;
    }

    return yoga.fetch(request);
  },
};
