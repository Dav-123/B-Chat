module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': '.',
            '@components': './components',
            '@features': './features',
            '@services': './services',
            '@mesh': './mesh',
            '@hooks': './hooks',
            '@store': './store',
            '@database': './database',
            '@utils': './utils',
            '@constants': './constants',
            '@types': './types',
            '@animations': './animations',
          },
        },
      ],

      // MUST stay last
      'react-native-reanimated/plugin',
    ],
  };
};