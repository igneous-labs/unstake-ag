import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const JPOOL_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1"),
    validatorList: new PublicKey(
      "Ei2LhH2tDKPERnoNjQV5darTToZmbg45vDvftFFLNNWd",
    ),
    stakePoolToken: new PublicKey(
      "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1"),
    validatorList: new PublicKey(
      "Ei2LhH2tDKPERnoNjQV5darTToZmbg45vDvftFFLNNWd",
    ),
    stakePoolToken: new PublicKey(
      "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("CtMyWsrUtAwXWiGr9WjHT5fC3p3fgV8cyGpLTo2LJzG1"),
    validatorList: new PublicKey(
      "Ei2LhH2tDKPERnoNjQV5darTToZmbg45vDvftFFLNNWd",
    ),
    stakePoolToken: new PublicKey(
      "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn",
    ),
  },
};
