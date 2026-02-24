import type { EnhanceAppContext } from 'vitepress';
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import Theme from 'vitepress/theme-without-fonts';

// eslint-disable-next-line import-x/no-unresolved
import 'virtual:group-icons.css';
import '@shikijs/vitepress-twoslash/style.css';
import './custom.css';

export default {
  extends: Theme,
  enhanceApp({ app }: EnhanceAppContext) {
    app.use(TwoslashFloatingVue);
  },
};
