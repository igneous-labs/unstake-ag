import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const LAINE_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("2qyEeSAWKfU18AFthrF7JA8z8ZCi1yt76Tqs917vwQTV"),
    validatorList: new PublicKey("sHPN95ARJpwN3Yipc22Z3m5118K3czRLBG7WmLDLsMp"),
    stakePoolToken: new PublicKey(
      "LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("2qyEeSAWKfU18AFthrF7JA8z8ZCi1yt76Tqs917vwQTV"),
    validatorList: new PublicKey("sHPN95ARJpwN3Yipc22Z3m5118K3czRLBG7WmLDLsMp"),
    stakePoolToken: new PublicKey(
      "LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("2qyEeSAWKfU18AFthrF7JA8z8ZCi1yt76Tqs917vwQTV"),
    validatorList: new PublicKey("sHPN95ARJpwN3Yipc22Z3m5118K3czRLBG7WmLDLsMp"),
    stakePoolToken: new PublicKey(
      "LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X",
    ),
  },
};
