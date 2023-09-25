import type { PublicKey } from "@solana/web3.js";

export type SplStakePoolAccounts = {
  program: PublicKey;
  stakePool: PublicKey;
  /**
   * This can be read from the stake pool struct but
   * we are updating accounts in one-shot so we need to know this beforehand
   */
  validatorList: PublicKey;
  stakePoolToken: PublicKey;
};

export * from "./cogent";
export * from "./consts";
export * from "./daopool";
export * from "./eversol";
export * from "./jito";
export * from "./jpool";
export * from "./laine";
export * from "./risklol";
export * from "./socean";
export * from "./solblaze";
export * from "./mrgn";
