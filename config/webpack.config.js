const CopyPlugin = require('copy-webpack-plugin');
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

const config = {
  mode: process.env.NODE_ENV,
  target: 'web',
  devtool: inDev() ? 'source-map' : undefined,
  entry: {
    background: join(Background, 'index.ts'),
    content: join(Content, 'index.tsx'),
    app: join(SidePanel, 'index.tsx')
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
          from: Public,
          to: 'assets',
          globOptions: {
            ignore: ['**/_locales/**'],
          },
        },
        {
          from: 'public/_locales',
          to: '_locales'
        },
        {
          from: require.resolve('pdfjs-dist/build/pdf.worker.mjs'),
          to: '.'
        }
      ]
    })
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/].*[\\/]/,
          name: 'assets/vendor',
          chunks: chunk => chunk.name !== "background"
        }
      }
    }
  }
};

const buildConfig = browser => ({
  ...config,
  name: browser,
  output: {
    path: join(Dist, browser),
    filename: '[name].js',
    publicPath: process.env.EXTENSION_PUBLIC_PATH || '/'
  }
});

module.exports = buildConfig(process.env.BROWSER || 'chrome');
