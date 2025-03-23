// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DummyToggle {
    // Initially, the execute function will fail
    bool public shouldFail = true;

    /**
     * @notice Executes the function.
     * @return A success message if the execution does not fail.
     */
    function execute() external view returns (string memory) {
        require(!shouldFail, "Function is failing");
        return "Executed";
    }

    /**
     * @notice Toggle the failure condition so that execute() will succeed.
     */
    function toggle() external {
        shouldFail = false;
    }
}