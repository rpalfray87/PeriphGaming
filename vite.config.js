import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/PeriphGaming/',
  publicDir: 'Ressources',
  build: {
    rollupOptions: {
      input: {
        home: fileURLToPath(new URL('./index.html', import.meta.url)),
        shop: fileURLToPath(new URL('./shop.html', import.meta.url)),
      },
    },
  },
});
