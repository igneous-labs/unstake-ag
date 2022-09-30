import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { EVERSOL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const EVERSOL_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: EVERSOL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("GUAMR8ciiaijraJeLDEDrFVaueLm9YzWWY9R7CBPL9rA"),
    validatorList: new PublicKey(
      "37FpUCPhUsX1dLhfm7gt3cArq7U2vmMpapoo7SGZWB9E",
    ),
    stakePoolToken: new PublicKey(
      "Hg35Vd8K3BS2pLB3xwC2WqQV8pmpCm3oNRGYP1PEpmCM",
    ),
  },
  testnet: {
    program: EVERSOL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("GUAMR8ciiaijraJeLDEDrFVaueLm9YzWWY9R7CBPL9rA"),
    validatorList: new PublicKey(
      "37FpUCPhUsX1dLhfm7gt3cArq7U2vmMpapoo7SGZWB9E",
    ),
    stakePoolToken: new PublicKey(
      "Hg35Vd8K3BS2pLB3xwC2WqQV8pmpCm3oNRGYP1PEpmCM",
    ),
  },
  "mainnet-beta": {
    program: EVERSOL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("GUAMR8ciiaijraJeLDEDrFVaueLm9YzWWY9R7CBPL9rA"),
    validatorList: new PublicKey(
      "37FpUCPhUsX1dLhfm7gt3cArq7U2vmMpapoo7SGZWB9E",
    ),
    stakePoolToken: new PublicKey(
      "Hg35Vd8K3BS2pLB3xwC2WqQV8pmpCm3oNRGYP1PEpmCM",
    ),
  },
};
