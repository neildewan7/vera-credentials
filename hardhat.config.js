require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const accounts = [process.env.PRIVATE_KEY, process.env.PRIVATE_KEY_2].filter(Boolean);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
  version: "0.8.20",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
},
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts,
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "",
      accounts,
    },
    arbitrumSepolia: {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "",
      accounts,
    },
  },
};
