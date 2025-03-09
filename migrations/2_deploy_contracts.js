const EVotingSystem = artifacts.require("EVotingSystem");

module.exports = function (deployer) {
  deployer.deploy(EVotingSystem);
};