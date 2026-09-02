import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the project site at https://minewefu.github.io/trialbook/
export default defineConfig({
  plugins: [react()],
  base: '/trialbook/',
  // Honour a PORT from the environment (used by preview tooling); default to Vite's usual port.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  build: { sourcemap: true },
});
