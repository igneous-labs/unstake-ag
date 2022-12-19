import type {
  AccountInfo,
  Keypair,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AccountInfoMap } from "@jup-ag/core/dist/lib/amm";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type {
  PubkeyFromSeed,
  WithPayer,
  WithStakeAuths,
} from "@/unstake-ag/common";
import type { WithdrawStakePoolLabel } from "@/unstake-ag/unstakeAg/labels";

/**
 * A WithdrawStakePool in this context is any on-chain entity
 * that accepts `withdrawStakeToken` tokens in return for stake accounts
 *
 * Classes that implement this should cache relevant on-chain accounts,
 * none of the methods here should perform any rpc calls
 */
export interface WithdrawStakePool {
  withdrawStakeToken: PublicKey;

  label: WithdrawStakePoolLabel;

  mustUseKeypairForSplitStake: boolean;

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
  newStakeAccount: PubkeyFromSeed | Keypair;
  tokenAmount: bigint;
  srcTokenAccount: PublicKey;
  srcTokenAccountAuth: PublicKey;

  /**
   * Should be from WithdrawStakeQuote.result
   */
  stakeSplitFrom: PublicKey;

  /**
   * Only spl stake pools use this parameter currently
   */
  isUserPayingForStakeAccountRent: boolean;
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
    /**
     * Any additional SOL that needs to be paid as rent-exempt fees for
     * the stake account to be created.
     * TECH DEBT: in the future, withdrawStake might pay rent for other accounts too
     * not just the stake account - idk some exotic stake pool program that records
     * withdrawals in on-chain accounts.
     */
    additionalRentLamports: bigint;
  };
}

export * from "./lido";
export * from "./utils";
