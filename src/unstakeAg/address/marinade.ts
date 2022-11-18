/**
 * TODO: use marinade's referral program as well when we are onboarded as a referrer
 */

import { PublicKey } from "@solana/web3.js";

import type { AddressMap } from "@/unstake-ag/unstakeAg/address";

export type MarinadeAccounts = {
  program: PublicKey;
  state: PublicKey;
  /**
   * Similar to SPL stake pool, this can be read from `state` but
   * we are updating accounts in one-shot so we need to know this beforehand
   */
  validatorRecords: PublicKey;
  stakePoolToken: PublicKey;
};

// marinade uses same pubkeys for everything across all clusters

const MARINADE_PROGRAM = new PublicKey(
  "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
);
const MARINADE_STATE = new PublicKey(
  "8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC",
);
// PublicKey.createWithSeed(state, "validator_list", program)
const MARINADE_VALIDATOR_RECORDS = new PublicKey(
  "DwFYJNnhLmw19FBTrVaLWZ8SZJpxdPoSYVSJaio9tjbY",
);

const MSOL = new PublicKey("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So");

const MARINADE_ADDRESS_MAP_ENTRY = {
  program: MARINADE_PROGRAM,
  state: MARINADE_STATE,
  validatorRecords: MARINADE_VALIDATOR_RECORDS,
  stakePoolToken: MSOL,
};

export const MARINADE_ADDRESS_MAP: AddressMap<MarinadeAccounts> = {
  devnet: MARINADE_ADDRESS_MAP_ENTRY,
  testnet: MARINADE_ADDRESS_MAP_ENTRY,
  "mainnet-beta": MARINADE_ADDRESS_MAP_ENTRY,
};
