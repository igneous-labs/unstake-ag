import type { PublicKey } from "@solana/web3.js";

export interface WithStakeAuths {
  withdrawerAuth: PublicKey;
  stakerAuth: PublicKey;
}

export interface WithPayer {
  payer: PublicKey;
}

export interface PubkeyFromSeed {
  base: PublicKey;
  derived: PublicKey;
  seed: string;
}
