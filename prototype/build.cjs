// Build script for prototype - bundles TypeScript with esbuild
const { build } = require('esbuild');

build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: false,
  sourcemap: false,
})
  .then(() => console.log('Build success! -> bundle.js'))
  .catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
  });
