const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: './src/content_scripts/content_script.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            // Add new rule for copying manifest.json
            {
                test: /manifest\.json$/,
                use: [
                    {
                        loader: 'file-loader',
                        options: {
                            name: '[name].[ext]',
                            outputPath: './',
                        },
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: './content_scripts/content_script.js',
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        // Add CopyWebpackPlugin to copy manifest.json
        new CopyWebpackPlugin({
            patterns: [{ from: './src/manifest.json', to: './' }],
        }),
    ],
};