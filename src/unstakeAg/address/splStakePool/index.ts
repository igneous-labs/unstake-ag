import { PublicKey } from "@solana/web3.js";

export * from "./daopool";
export * from "./jpool";
export * from "./socean";
export * from "./solblaze";

export type SplStakePoolAccounts = {
  program: PublicKey;
  stakePool: PublicKey;
  validatorList: PublicKey;
  stakePoolToken: PublicKey;
};

export const OFFICIAL_SPL_STAKE_POOL_PROGRAM_ID = new PublicKey(
  "SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy",
);
