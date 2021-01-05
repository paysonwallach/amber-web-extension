/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin");
const SizePlugin = require("size-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const WextManifestWebpackPlugin = require("wext-manifest-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");

const dataPath = path.join(__dirname, "data");
const destPath = path.join(__dirname, "distribution");
const sourcePath = path.join(__dirname, "source");
const stylesPath = path.join(dataPath, "styles");
const viewsPath = path.join(dataPath, "views");
const targetBrowser = process.env.TARGET_BROWSER;

const getExtensionFileType = (browser) => {
  switch (browser) {
    case "opera":
      return "crx";
    case "firefox":
      return "xpi";
    default:
      return "zip";
  }
};

module.exports = {
  devtool: false, // https://github.com/webpack/webpack/issues/1194#issuecomment-560382342
  stats: {
    all: false,
    builtAt: true,
    errors: true,
    hash: true,
  },
  entry: {
    manifest: path.join(dataPath, "manifest.json"),
    background: path.join(sourcePath, "Background", "index.ts"),
    popup: path.join(sourcePath, "Popup", "App.tsx"),
    // options: path.join(sourcePath, "Options", "index.tsx"),
  },
  output: {
    path: path.join(destPath, targetBrowser),
    filename: "[name].js",
  },
  resolve: {
    alias: {
      "webextension-polyfill-ts": path.resolve(
        path.join(__dirname, "node_modules", "webextension-polyfill-ts")
      ),
      Common: path.join(sourcePath, "Common"),
      Popup: path.join(sourcePath, "Popup"),
      // Options: path.join(
      //   sourcePath, "Options"
      // ),
      Utils: path.join(sourcePath, "Utils"),
    },
    extensions: [".ts", ".tsx", ".js", ".json"],
  },
  module: {
    rules: [
      {
        type: "javascript/auto", // prevent webpack handling json with its own loaders,
        test: /manifest\.json$/,
        use: {
          loader: "wext-manifest-loader",
        },
        exclude: /node_modules/,
      },
      {
        test: /\.(js|ts)x?$/,
        use: [
          {
            loader: "babel-loader",
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.(sa|sc|c)ss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader, // It creates a CSS file per JS file which contains CSS
          },
          {
            loader: "css-loader", // Takes the CSS files and returns the CSS with imports and url(...) for Webpack
            options: {
              sourceMap: true,
            },
          },
          {
            loader: "postcss-loader", // For autoprefixer
            options: {
              postcssOptions: {
                ident: "postcss",
                // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
                plugins: [require("autoprefixer")()],
              },
            },
          },
          "resolve-url-loader", // Rewrites relative paths in url() statements
          "sass-loader", // Takes the Sass/SCSS file and compiles to the CSS
        ],
      },
    ],
  },
  plugins: [
    new SizePlugin(),
    new WextManifestWebpackPlugin(),
    new webpack.SourceMapDevToolPlugin({ filename: false }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: stylesPath,
        },
        {
          from: viewsPath,
        },
        {
          from: "node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
        },
      ],
    }),
  ],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          mangle: false,
          compress: false,
          output: {
            beautify: true,
            indent_level: 2, // eslint-disable-line camelcase
          },
        },
      }),
      new OptimizeCSSAssetsPlugin({
        cssProcessorPluginOptions: {
          preset: ["default", { discardComments: { removeAll: true } }],
        },
      }),
      // new ZipPlugin({
      //   path: destPath,
      //   extension: `${getExtensionFileType(targetBrowser)}`,
      //   filename: `${targetBrowser}`,
      // }),
    ],
  },
};
