import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const COGENT_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az"),
    validatorList: new PublicKey(
      "CGNTvFQ5yhxp2H5RmmXJ2w3LXJ3kAHrgPMrfABBTkeTr",
    ),
    stakePoolToken: new PublicKey(
      "CgnTSoL3DgY9SFHxcLj6CgCgKKoTBr6tp4CPAEWy25DE",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az"),
    validatorList: new PublicKey(
      "CGNTvFQ5yhxp2H5RmmXJ2w3LXJ3kAHrgPMrfABBTkeTr",
    ),
    stakePoolToken: new PublicKey(
      "CgnTSoL3DgY9SFHxcLj6CgCgKKoTBr6tp4CPAEWy25DE",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CgntPoLka5pD5fesJYhGmUCF8KU1QS1ZmZiuAuMZr2az"),
    validatorList: new PublicKey(
      "CGNTvFQ5yhxp2H5RmmXJ2w3LXJ3kAHrgPMrfABBTkeTr",
    ),
    stakePoolToken: new PublicKey(
      "CgnTSoL3DgY9SFHxcLj6CgCgKKoTBr6tp4CPAEWy25DE",
    ),
  },
};
