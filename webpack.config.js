const path = require('path')
const WasmPackPlugin = require('@wasm-tool/wasm-pack-plugin')

module.exports = {
  target: 'webworker',
  entry: './src/index.js',
  mode: 'production',
  // devtool: "cheap-module-source-map",
  plugins: [
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, '.'),
      outDir: 'src/pkg',
    }),
  ],
}
