// SPDX-License-Identifier: MIT
pragma solidity ^0.7.0;

contract VulnerableContract {
    mapping(address => uint) public balances;
    address public owner;
    
    // Using tx.origin for authentication
    function withdraw() public {
        require(tx.origin == msg.sender, "Not authorized");
        uint amount = balances[msg.sender];
        
        // External call before state update - reentrancy
        (bool success, ) = msg.sender.call{value: amount}("");
        
        if (success) {
            balances[msg.sender] = 0;
        }
    }
    
    // Integer overflow risk
    function addBalance(uint amount) public {
        uint newBalance = balances[msg.sender] + amount;
        balances[msg.sender] = newBalance;
    }
    
    // Delegatecall risk
    function upgrade(address newImpl) public {
        (bool success, ) = address(this).delegatecall(
            abi.encodeWithSignature("setImplementation(address)", newImpl)
        );
    }
    
    // Selfdestruct not protected
    function destroy() public {
        selfdestruct(payable(msg.sender));
    }
}
