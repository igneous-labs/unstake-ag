import type { PublicKey } from "@solana/web3.js";

export type SplStakePoolAccounts = {
  program: PublicKey;
  stakePool: PublicKey;
  validatorList: PublicKey;
  stakePoolToken: PublicKey;
};

export * from "./consts";
export * from "./daopool";
export * from "./jpool";
export * from "./socean";
export * from "./solblaze";
