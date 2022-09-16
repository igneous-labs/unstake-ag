import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";
import { OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID } from "@/unstake-ag/unstakeAg/address/splStakePool/consts";

/**
 * NOTE: DEVNET AND TESTNET DONT WORK
 */
export const SOLBLAZE_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi"),
    validatorList: new PublicKey("1istpXjy8BM7Vd5vPfA485frrV7SRJhgq5vs3sskWmc"),
    stakePoolToken: new PublicKey(
      "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    ),
  },
  testnet: {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi"),
    validatorList: new PublicKey("1istpXjy8BM7Vd5vPfA485frrV7SRJhgq5vs3sskWmc"),
    stakePoolToken: new PublicKey(
      "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    ),
  },
  "mainnet-beta": {
    program: OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID,
    stakePool: new PublicKey("stk9ApL5HeVAwPLr3TLhDXdZS8ptVu7zp6ov8HFDuMi"),
    validatorList: new PublicKey("1istpXjy8BM7Vd5vPfA485frrV7SRJhgq5vs3sskWmc"),
    stakePoolToken: new PublicKey(
      "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    ),
  },
};
