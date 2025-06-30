// Custom process/browser polyfill for snarkjs
const process = {
  env: {},
  browser: true,
  version: '',
  nextTick: function(cb) {
    setTimeout(cb, 0);
  }
};

module.exports = process; 