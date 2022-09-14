import { AccountInfo, PublicKey } from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";

/**
 * A StakePool in this context is any on-chain entity
 * that accepts stake accounts in return for tokens
 *
 */
export interface StakePool {
  outputToken: PublicKey;

  canAcceptStakeAccount(
    stakeAccount: AccountInfo<StakeAccount>,
    params: CanAcceptStakeAccountParams,
  ): boolean;
}

export interface CanAcceptStakeAccountParams {
  currentEpoch: number;
}
