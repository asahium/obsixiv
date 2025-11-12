import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  outfile: 'dist/index.bundled.js',
  platform: 'node',
  target: 'node18',
  format: 'esm',
  external: ['@modelcontextprotocol/sdk'],
  banner: {
    js: '#!/usr/bin/env node\n',
  },
});

console.log('✅ Build complete!');

