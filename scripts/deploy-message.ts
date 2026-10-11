import { network } from "hardhat";

const { ethers } = await network.connect();

async function main() { 
  const messageFactory = await ethers.getContractFactory("Message");

  const message = await messageFactory.deploy("Hello Blockchain!");
  await message.waitForDeployment();

  console.log("Message contract deployed successfully!");
  console.log("Contract address:", await message.getAddress());
  console.log("Initial message:", await message.getMessage());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});