import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the project site at https://minewefu.github.io/trialbook/
export default defineConfig({
  plugins: [react()],
  base: '/trialbook/',
  server: { port: 5173, strictPort: true },
  build: { sourcemap: true },
});
