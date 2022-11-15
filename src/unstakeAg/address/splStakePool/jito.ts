import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const JITO_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"),
    validatorList: new PublicKey(
      "3R3nGZpQs2aZo5FDQvd2MUQ6R7KhAPainds6uT6uE2mn",
    ),
    stakePoolToken: new PublicKey(
      "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"),
    validatorList: new PublicKey(
      "3R3nGZpQs2aZo5FDQvd2MUQ6R7KhAPainds6uT6uE2mn",
    ),
    stakePoolToken: new PublicKey(
      "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"),
    validatorList: new PublicKey(
      "3R3nGZpQs2aZo5FDQvd2MUQ6R7KhAPainds6uT6uE2mn",
    ),
    stakePoolToken: new PublicKey(
      "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    ),
  },
};
