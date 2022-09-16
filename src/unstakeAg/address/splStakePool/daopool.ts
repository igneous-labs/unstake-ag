import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const DAOPOOL_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("7ge2xKsZXmqPxa3YmXxXmzCp9Hc2ezrTxh6PECaxCwrL"),
    validatorList: new PublicKey(
      "CKG4Jci9tGSrZtetnLXuDKV2WqaknFCUX9CY3ahfw2n6",
    ),
    stakePoolToken: new PublicKey(
      "GEJpt3Wjmr628FqXxTgxMce1pLntcPV4uFi8ksxMyPQh",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("7ge2xKsZXmqPxa3YmXxXmzCp9Hc2ezrTxh6PECaxCwrL"),
    validatorList: new PublicKey(
      "CKG4Jci9tGSrZtetnLXuDKV2WqaknFCUX9CY3ahfw2n6",
    ),
    stakePoolToken: new PublicKey(
      "GEJpt3Wjmr628FqXxTgxMce1pLntcPV4uFi8ksxMyPQh",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("7ge2xKsZXmqPxa3YmXxXmzCp9Hc2ezrTxh6PECaxCwrL"),
    validatorList: new PublicKey(
      "CKG4Jci9tGSrZtetnLXuDKV2WqaknFCUX9CY3ahfw2n6",
    ),
    stakePoolToken: new PublicKey(
      "GEJpt3Wjmr628FqXxTgxMce1pLntcPV4uFi8ksxMyPQh",
    ),
  },
};
