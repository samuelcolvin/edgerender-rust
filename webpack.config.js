const path = require('path')
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = {
  target: 'webworker',
  entry: './src/index.js',
  mode: 'production',
  optimization: {
    minimize: false,
    namedModules: true,
    namedChunks: false,  // breaks if true
    mangleWasmImports: false,
  },
  plugins: [
    new CleanWebpackPlugin(),
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, '.'),
      outDir: 'src/pkg',
    }),
  ],
}
