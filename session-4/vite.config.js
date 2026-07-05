import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  root: 'frontend',
  envDir: '..', // .env lives at the project root
  envPrefix: ['VITE_'],
  server: { port: 5174, open: true },
  plugins: [
    // js-moi-sdk depends on Node built-ins (buffer, crypto, util, vm)
    nodePolyfills({ protocolImports: true }),
  ],
  // Note: js-moi-providers' ESM build ships without validateAssetAction —
  // fixed via patch-package (see patches/), applied on npm install.
})
