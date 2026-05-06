// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {GavelOracle} from "../src/GavelOracle.sol";

contract Deploy is Script {
    function run() external returns (GavelOracle oracle) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address signer = vm.envAddress("ORACLE_SIGNER");

        vm.startBroadcast(pk);
        oracle = new GavelOracle(signer);
        vm.stopBroadcast();

        console.log("GavelOracle deployed at:", address(oracle));
        console.log("Oracle signer:", signer);
    }
}
