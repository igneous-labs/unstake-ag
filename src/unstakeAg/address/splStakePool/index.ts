import type { PublicKey } from "@solana/web3.js";

export * from "./socean";

export type SplStakePoolAccounts = {
  program: PublicKey;
  stakePool: PublicKey;
  validatorList: PublicKey;
  stakePoolToken: PublicKey;
};
