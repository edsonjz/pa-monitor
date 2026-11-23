import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(mjs|cjs|js|ts|tsx|json)$/.test(specifier)) {
      for (const ext of ['.ts', '.tsx']) {
        const candidateUrl = new URL(`${specifier}${ext}`, context.parentURL);
        if (existsSync(fileURLToPath(candidateUrl))) {
          return nextResolve(`${specifier}${ext}`, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
