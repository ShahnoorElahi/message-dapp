
 // SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

contract Message {
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

    function getMessage() public view returns (string memory) {
        return message;
    }

    // Any account can update the message.
    function updateMessage(
        string memory newMessage
    ) public {
        require(
            bytes(newMessage).length > 0,
            "Message cannot be empty"
        );

        message = newMessage;

        emit MessageUpdated(msg.sender, newMessage);
    }
}
