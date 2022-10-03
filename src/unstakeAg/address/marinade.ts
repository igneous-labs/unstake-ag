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
};

/**
 * TODO: verify devnet and testnet addresses are same as mainnet
 */
export const MARINADE_ADDRESS_MAP: AddressMap<MarinadeAccounts> = {
  devnet: {
    program: new PublicKey("MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD"),
    state: new PublicKey("8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC"),
    validatorRecords: new PublicKey(
      "DwFYJNnhLmw19FBTrVaLWZ8SZJpxdPoSYVSJaio9tjbY",
    ),
  },
  testnet: {
    program: new PublicKey("MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD"),
    state: new PublicKey("8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC"),
    validatorRecords: new PublicKey(
      "DwFYJNnhLmw19FBTrVaLWZ8SZJpxdPoSYVSJaio9tjbY",
    ),
  },
  "mainnet-beta": {
    program: new PublicKey("MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD"),
    state: new PublicKey("8szGkuLTAux9XMgZ2vtY39jVSowEcpBfFfD8hXSEqdGC"),
    // PublicKey.createWithSeed(state, "validator_list", program)
    validatorRecords: new PublicKey(
      "DwFYJNnhLmw19FBTrVaLWZ8SZJpxdPoSYVSJaio9tjbY",
    ),
  },
};
