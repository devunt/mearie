import type { ReactNode } from 'react';
import { createRootRoute, Outlet, Scripts, HeadContent, Link } from '@tanstack/react-router';
import { ClientProvider } from '@mearie/react';
import { mearieClient } from '../lib/client.ts';
import stylesUrl from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Mearie React Examples' },
    ],
    links: [{ rel: 'stylesheet', href: stylesUrl }],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
});

function RootComponent() {
  return (
    <RootDocument>
      <ClientProvider client={mearieClient}>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-neutral-200">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-center h-16">
                <Link to="/" className="text-lg font-semibold text-neutral-950" search={{}} resetScroll={true}>
                  Mearie Examples
                </Link>
              </div>
            </div>
          </header>
          <main className="flex-1">
            <div className="max-w-7xl mx-auto px-6 py-12 pb-24">
              <Outlet />
            </div>
          </main>
        </div>
      </ClientProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto text-center py-24">
      <h1 className="text-4xl font-bold text-neutral-950 mb-4">404</h1>
      <p className="text-neutral-600 mb-8">The page you're looking for doesn't exist.</p>
      <Link to="/" className="text-sm text-neutral-950 border-b border-neutral-950">
        Back to examples
      </Link>
    </div>
  );
}
