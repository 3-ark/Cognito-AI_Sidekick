const CopyPlugin = require('copy-webpack-plugin');
const ImageMinimizerPlugin = require('image-minimizer-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const dotenv = require('dotenv');
const webpack = require('webpack');
const { join } = require('path');
const { Compilation } = require('webpack');
const { inDev } = require("./helpers");
const packageJson = require('../package.json');

dotenv.config();

const browsers = [
  'chrome'
];

const Root = join(__dirname, '..');
const Source = join(Root, 'src');
const Dist = join(Root, 'dist');

const Public = join(Root, 'public');
const Background = join(Source, 'background');
const Content = join(Source, 'content');
const SidePanel = join(Source, 'sidePanel');
const Lib = join(Source, 'lib');
const Options = join(Source, 'options');
const Note = join(Source, 'note');
const Analysis = join(Source, 'analysis');

const config = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  target: 'web',
  devtool: inDev() ? 'source-map' : undefined,
  entry: {
    background: join(Background, 'index.ts'),
    content: join(Content, 'index.tsx'),
    fab: join(Content, 'fab', 'index.tsx'),
    app: join(SidePanel, 'index.tsx'),
    note: join(Note, 'index.tsx'),
    analysis: join(Analysis, 'index.tsx')
  },
  module: { rules: require('./rules') },
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: {
      lib: Lib,
      '@': Root,
      background: Background,
      sidePanel: SidePanel,
      '@/utils': join(Background, 'util.ts'), 
      content: Content,
      assets: Public,
      options: Options,
      ...require('./aliases')
    }
  },
  plugins: [
    ...require('./plugins'),
    new webpack.DefinePlugin({
      'APP_VERSION': JSON.stringify(packageJson.version)
    }),
    new HtmlWebpackPlugin(
        {
          inject: 'body',
          template: join(SidePanel, 'index.html'),
          filename: 'assets/sidePanel.html',
          chunks: ['app']
        }),
    new HtmlWebpackPlugin({
      inject: 'body',
      template: join(Public, 'note.html'),
      filename: 'note.html',
      chunks: ['note']
    }),
    new HtmlWebpackPlugin({
      inject: 'body',
      template: join(Public, 'analysis.html'),
      filename: 'analysis.html',
      chunks: ['analysis']
    }),
    ...browsers.map(browser => ({
      apply: (compiler) => {
        compiler.hooks.thisCompilation.tap('CustomGenerateManifestPlugin', (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'CustomGenerateManifestPlugin',
              stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            },
            (assets) => {
              const generateManifestFunction = require('./generate-manifest.js');

              const manifestContent = generateManifestFunction(browser);

              assets['manifest.json'] = new webpack.sources.RawSource(manifestContent);
            }
          );
        });
      },
    })),
    new CopyPlugin({
      patterns: [
        {
          from: join(Public, 'fonts'),
          to: 'assets/fonts'
        },
        {
          from: join(Public, 'images'),
          to: 'assets/images'
        },
        {
          from: join(Public, '_locales'),
          to: '_locales'
        },
        {
          from: require.resolve('pdfjs-dist/build/pdf.worker.mjs'),
          to: '.'
        },
        {
          from: join(Content, 'index.css'),
          to: 'index.css'
        },
        {
          from: join(Content, 'fab', 'fab.css'),
          to: 'fab.css'
        },
      ]
    })
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        'vendor-content': {
          test: /[\\/]node_modules[\\/]/,
          name: 'assets/vendor-content',
          chunks: chunk => chunk.name === 'content'
        },
        'vendor-ui': {
          test: /[\\/]node_modules[\\/]/,
          name: 'assets/vendor-ui',
          chunks: chunk => chunk.name === 'app' || chunk.name === 'note' || chunk.name === 'analysis'
        }
      }
    },
    minimizer: [
      '...', // This extends existing minimizers (like terser-webpack-plugin)
      new ImageMinimizerPlugin({
        minimizer: {
          implementation: ImageMinimizerPlugin.sharpMinify,
          options: {
            encodeOptions: {
              jpeg: { quality: 80 },
              webp: { quality: 80 },
              avif: { quality: 80 },
              png: { quality: 80 },
              gif: { quality: 80 },
            },
          },
        },
      }),
    ],
  },
  performance: {
    hints: 'warning', // 'error' or false are other options
    maxAssetSize: 1024 * 1024, // 1 MiB
    maxEntrypointSize: 2.5 * 1024 * 1024, // 2.5 MiB
  },
  watchOptions: {
    ignored: [
      `${Dist.replace(/\\/g, '/')}/**`,
      '**/.git/**',
      '**/node_modules/**',
      '**/*.log'
    ]
  }
};

const buildConfig = browser => ({
  ...config,
  name: browser,
  output: {
    path: join(Dist, browser),
    filename: '[name].js',
    publicPath: process.env.EXTENSION_PUBLIC_PATH || './'
  }
});

module.exports = buildConfig(process.env.BROWSER || 'chrome');
