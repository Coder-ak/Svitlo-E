import esbuild from 'esbuild';
import { livereloadPlugin } from '@jgoz/esbuild-plugin-livereload';
import { lessLoader } from 'esbuild-plugin-less';
import { htmlPlugin } from '@craftamap/esbuild-plugin-html';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: ['src/client/script.ts', 'src/client/style.less', 'src/client/chart.ts'],
  entryNames: '[name]-[hash]',
  outdir: 'dist/client',
  bundle: true,
  minify: !watch,
  sourcemap: watch,
  target: 'node16',
  logLevel: 'info',
  write: true,
  metafile: true,
  plugins: [
    lessLoader(),
    htmlPlugin({
      files: [
        {
          entryPoints: ['src/client/script.ts', 'src/client/style.less'],
          filename: 'index.html',
          htmlTemplate: 'src/client/index.html',
        },
        {
          entryPoints: ['src/client/chart.ts', 'src/client/style.less'],
          filename: 'chart.html',
          htmlTemplate: 'src/client/chart.html',
        },
      ],
    }),
  ],
};

if (watch) {
  buildOptions.plugins = [...buildOptions.plugins, livereloadPlugin()];
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
} else {
  await esbuild.build(buildOptions);
}
