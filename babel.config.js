// This is only used by Jest; `tsc` is used directly for transpilation.

module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }], +'@babel/preset-typescript'],
};
