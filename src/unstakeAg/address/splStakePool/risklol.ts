import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const RISK_LOL_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("F8h46pYkaqPJNP2MRkUUUtRkf8efCkpoqehn9g1bTTm7"),
    validatorList: new PublicKey(
      "3p3pwXkx15WSphpmcQyBqJ235pMVQkLYM9t2faBH1Zix",
    ),
    stakePoolToken: new PublicKey(
      "C4kq9QRFLAqwYHK7p4Ez54KMZLZNw2yLsiT3KN4FSmdH",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("F8h46pYkaqPJNP2MRkUUUtRkf8efCkpoqehn9g1bTTm7"),
    validatorList: new PublicKey(
      "3p3pwXkx15WSphpmcQyBqJ235pMVQkLYM9t2faBH1Zix",
    ),
    stakePoolToken: new PublicKey(
      "C4kq9QRFLAqwYHK7p4Ez54KMZLZNw2yLsiT3KN4FSmdH",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("F8h46pYkaqPJNP2MRkUUUtRkf8efCkpoqehn9g1bTTm7"),
    validatorList: new PublicKey(
      "3p3pwXkx15WSphpmcQyBqJ235pMVQkLYM9t2faBH1Zix",
    ),
    stakePoolToken: new PublicKey(
      "C4kq9QRFLAqwYHK7p4Ez54KMZLZNw2yLsiT3KN4FSmdH",
    ),
  },
};
