import { defineProject } from 'vitest/config';
import solid from 'vite-plugin-solid';

export default defineProject({
  plugins: [solid()],
  test: {
    globals: true,
    environment: 'happy-dom',
    deps: {
      // fixes: You appear to have multiple instances of Solid
      // https://github.com/solidjs/vite-plugin-solid/issues/120
      inline: ['solid-js', '@solidjs/testing-library']
    }
  },
  resolve: {
    conditions: ['development', 'browser']
  }
});
