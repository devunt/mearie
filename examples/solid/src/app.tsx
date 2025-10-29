import { MetaProvider, Title } from '@solidjs/meta';
import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';
import { A } from '@solidjs/router';
import { ClientProvider } from '@mearie/solid';
import { mearieClient } from './lib/client.ts';
import './app.css';

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Title>Mearie Solid Examples</Title>
          <ClientProvider client={mearieClient}>
            <div class="min-h-screen flex flex-col">
              <header class="border-b border-neutral-200">
                <div class="max-w-7xl mx-auto px-6">
                  <div class="flex items-center h-16">
                    <A href="/" class="text-lg font-semibold text-neutral-950">
                      Mearie Examples
                    </A>
                  </div>
                </div>
              </header>
              <main class="flex-1">
                <div class="max-w-7xl mx-auto px-6 py-12 pb-24">
                  <Suspense>{props.children}</Suspense>
                </div>
              </main>
            </div>
          </ClientProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
