
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract MessageOnlyOwner {
    string private message;

    address public owner;

    event MessageUpdated(
        address indexed updatedBy,
        string newMessage
    );

    constructor(string memory initialMessage) {
        owner = msg.sender;
        message = initialMessage;
    }

    // Reusable access-control rule.
    modifier onlyOwner() {
    require(
        msg.sender == owner,
        "Only owner can update the message"
    );

    _;
    
    }

    function getMessage() public view returns (string memory) {
        return message;
    }

    // Only the account that deployed this contract can update it.
    function updateMessage(
        string memory newMessage
    ) public onlyOwner {
        require(
            bytes(newMessage).length > 0,
            "Message cannot be empty"
        );

        message = newMessage;

        emit MessageUpdated(msg.sender, newMessage);
    }
}













