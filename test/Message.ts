
import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("Message", function () {
  async function deployMessage() {
    const messageFactory = await ethers.getContractFactory("Message");
    const message = await messageFactory.deploy("Hello Blockchain!");
    await message.waitForDeployment();

    return message;
  }

  it("Should store the initial message", async function () {
    const message = await deployMessage();

    expect(await message.getMessage()).to.equal("Hello Blockchain!");
  });

  it("Should allow updating the message", async function () {
    const message = await deployMessage();

    await message.updateMessage("Hello Web3!");

    expect(await message.getMessage()).to.equal("Hello Web3!");
  });

  it("Should emit MessageUpdated when the message changes", async function () {
    const message = await deployMessage();
    const [sender] = await ethers.getSigners();

    await expect(message.updateMessage("Updated message"))
      .to.emit(message, "MessageUpdated")
      .withArgs(sender.address, "Updated message");
  });

  it("Should reject an empty message", async function () {
    const message = await deployMessage();

    await expect(message.updateMessage(""))
      .to.be.revertedWith("Message cannot be empty");
  });

  it("Should record the deployer's address as owner", async function () {
    const [deployer] = await ethers.getSigners();
    const message = await deployMessage();

    expect(await message.owner()).to.equal(deployer.address);
  });









  
it("Should allow the owner to update the message", async function () {
  const [owner] = await ethers.getSigners();
  const message = await deployMessage();

  await message.connect(owner).updateMessage("Owner update");

  expect(await message.getMessage()).to.equal("Owner update");
});



it("Should allow a non-owner to update the message", async function () {
  const [, otherAccount] = await ethers.getSigners();
  const message = await deployMessage();

  await message.connect(otherAccount).updateMessage(
    "Updated by another wallet"
  );

  expect(await message.getMessage()).to.equal(
    "Updated by another wallet"
  );
});

});


