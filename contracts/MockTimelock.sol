// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockTimelock {
    address private mockCaller;
    address private tokenContract;

    function setMockCaller(address _caller) external {
        mockCaller = _caller;
    }

    function setTokenContract(address _token) external {
        tokenContract = _token;
    }

    function callSetMaxTokenSupply(uint256 _supply) external {
        require(mockCaller != address(0), "Caller not set");
        require(tokenContract != address(0), "Token contract not set");
        
        (bool success, bytes memory data) = tokenContract.call(
            abi.encodeWithSignature("setMaxTokenSupply(uint256)", _supply)
        );
        
        if (!success) {
            // Revert with the original error message if available
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert("Call to setMaxTokenSupply failed");
        }
    }

    function callGrantContractRole(bytes32 role, address account) external {
        require(mockCaller != address(0), "Caller not set");
        require(tokenContract != address(0), "Token contract not set");
        
        (bool success, bytes memory data) = tokenContract.call(
            abi.encodeWithSignature("grantContractRole(bytes32,address)", role, account)
        );
        
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert("Call to grantContractRole failed");
        }
    }

    function callRevokeContractRole(bytes32 role, address account) external {
        require(mockCaller != address(0), "Caller not set");
        require(tokenContract != address(0), "Token contract not set");
        
        (bool success, bytes memory data) = tokenContract.call(
            abi.encodeWithSignature("revokeContractRole(bytes32,address)", role, account)
        );
        
        if (!success) {
            if (data.length > 0) {
                assembly {
                    revert(add(data, 32), mload(data))
                }
            }
            revert("Call to revokeContractRole failed");
        }
    }
}