import type { Keypair, PublicKey } from "@solana/web3.js";

import type { PubkeyFromSeed } from "@/unstake-ag/common";
import type { WithdrawStakeQuote } from "@/unstake-ag/withdrawStakePools";

export const WITHDRAW_STAKE_QUOTE_FAILED: WithdrawStakeQuote = {};

export function isNewStakeAccountKeypair(
  k: PubkeyFromSeed | Keypair,
): k is Keypair {
  return "secretKey" in k;
}

export function newStakeAccountPubkey(k: PubkeyFromSeed | Keypair): PublicKey {
  return isNewStakeAccountKeypair(k) ? k.publicKey : k.derived;
}
