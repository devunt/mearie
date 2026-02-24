import { defineConfig } from 'tsdown';

export default defineConfig({
  format: ['esm', 'cjs'],
  dts: true,
  skipNodeModulesBundle: true,
  inputOptions(opts) {
    opts.onLog = (level, log, defaultHandler) => {
      if (
        log.code === 'MISSING_EXPORT' ||
        (log.code === 'IMPORT_IS_UNDEFINED' && log.message?.includes('node_modules'))
      )
        return;
      defaultHandler(level, log);
    };
    return opts;
  },
});
