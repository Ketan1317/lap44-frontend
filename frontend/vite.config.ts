import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-stdlib', '@react-three/fiber'],
          socket: ['socket.io-client'],
        },
      },
    },
    chunkSizeWarningLimit: 1500, // hide warning threshold
  },
});
