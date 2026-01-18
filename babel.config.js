module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@/components": "./components",
            "@/constants": "./constants",
            "@/hooks": "./hooks",
            "@/screens": "./screens",
            "@/utils": "./utils",
            "@/assets": "./assets",
            "@/firebase": "./firebase",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
