const path = require('path');

module.exports = {
  entry: './src/content_scripts/content_script.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: './src/content_scripts/content_script.js',
    path: path.resolve(__dirname, 'dist'),
  },
};