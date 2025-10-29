import { Title } from '@solidjs/meta';
import { HttpStatusCode } from '@solidjs/start';
import { A } from '@solidjs/router';

export default function NotFound() {
  return (
    <div class="max-w-2xl mx-auto text-center py-24">
      <Title>404 - Not Found</Title>
      <HttpStatusCode code={404} />
      <h1 class="text-4xl font-bold text-neutral-950 mb-4">404</h1>
      <p class="text-neutral-600 mb-8">The page you're looking for doesn't exist.</p>
      <A href="/" class="text-sm text-neutral-950 border-b border-neutral-950">
        Back to examples
      </A>
    </div>
  );
}
