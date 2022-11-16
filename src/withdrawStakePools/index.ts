import type {
  AccountInfo,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { AccountInfoMap } from "@jup-ag/core/dist/lib/amm";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type {
  PubkeyFromSeed,
  WithPayer,
  WithStakeAuths,
} from "@/unstake-ag/common";

/**
 * A WithdrawStakePool in this context is any on-chain entity
 * that accepts `withdrawStakeToken` tokens in return for stake accounts
 *
 * Classes that implement this should cache relevant on-chain accounts,
 * none of the methods here should perform any rpc calls
 */
export interface WithdrawStakePool {
  withdrawStakeToken: PublicKey;

  label: string;

  createWithdrawStakeInstructions(
    params: CreateWithdrawStakeInstructionsParams,
  ): TransactionInstruction[];

  /**
   * Only handles withdrawing max 1 stake account
   */
  getWithdrawStakeQuote(params: WithdrawStakeQuoteParams): WithdrawStakeQuote;

  // below methods are same signature as that from @jup-ag/core

  getAccountsForUpdate(): PublicKey[];

  update(accountInfoMap: AccountInfoMap): void;
}

export interface CreateWithdrawStakeInstructionsParams
  extends WithPayer,
    WithStakeAuths {
  /**
   * The new stake account that is split off and withdrawn
   */
  newStakeAccount: PubkeyFromSeed;
  tokenAmount: bigint;
  srcTokenAccount: PublicKey;
  srcTokenAccountAuth: PublicKey;

  /**
   * Should be from WithdrawStakeQuote
   */
  stakeSplitFrom: PublicKey;
}

export interface WithdrawStakeQuoteParams {
  currentEpoch: number;
  tokenAmount: bigint;
}

export interface WithdrawStakeQuote {
  /**
   * If undefined, not enough liquidity for withdrawal
   */
  result?: {
    outputDummyStakeAccountInfo: AccountInfo<StakeAccount>;
    stakeSplitFrom: PublicKey;
  };
}

export const WITHDRAW_STAKE_QUOTE_FAILED: WithdrawStakeQuote = {};
