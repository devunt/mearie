// @refresh reload
import { createHandler, StartServer } from '@solidjs/start/server';
import type { JSX } from 'solid-js';

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }: { assets: JSX.Element; children: JSX.Element; scripts: JSX.Element }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
