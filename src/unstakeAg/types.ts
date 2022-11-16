import type { AccountInfo, PublicKey, Transaction } from "@solana/web3.js";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type { UnstakeRoute } from "@/unstake-ag/route";

export interface ComputeRoutesParams {
  /**
   * The stake account to be unstaked
   */
  stakeAccount: AccountInfo<StakeAccount>;

  /**
   * The amount in lamports to be unstaked.
   * Should be <= stakeAccount.lamports.
   * If < stakeAccount.lamports, a stake split instruction will be
   * added to the setup instructions
   */
  amountLamports: bigint;

  /**
   * In basis point (0 - 10_000)
   */
  slippageBps: number;

  /**
   * Same as `jupiter.computeRoutes()` 's `forceFetch`:
   * If true, refetches all jup accounts and stake pool accounts
   *
   * Default to false
   */
  forceFetch?: boolean;

  /**
   * Optional additional fee to charge on jup swaps,
   * passed as `feeBps` to `jupiter.computeRoutes()`
   *
   * Defaults to undefined
   */
  jupFeeBps?: number;

  /**
   * Silently ignore routes where errors were thrown
   * during computation such as failing to fetch
   * required accounts.
   *
   * Defaults to true
   */
  shouldIgnoreRouteErrors?: boolean;
}

export interface ExchangeParams {
  /**
   * A route returned by `computeRoutes()`
   */
  route: UnstakeRoute;

  /**
   * Fetched on-chain data of the stake account
   * to unstake
   */
  stakeAccount: AccountInfo<StakeAccount>;

  /**
   * Pubkey of the stake account to unstake
   */
  stakeAccountPubkey: PublicKey;

  /**
   * Withdraw authority of the stake account to unstake
   */
  user: PublicKey;

  /**
   * Wrapped SOL account to receive optional additional fee on
   * jup swaps when `jupFeeBps` is set on `computeRoutes()`
   */
  feeAccounts?: FeeAccounts;
}

/**
 * Map of token mint to token accounts to receive referral fees
 * If token is So11111111111111111111111111111111111111112,
 * the value should be a wrapped SOL token account, not a system account.
 * SyncNative is not guaranteed to be called after transferring SOL referral fees
 */
export type FeeAccounts = {
  [token in string]?: PublicKey;
};

export interface ExchangeReturn {
  setupTransaction?: Transaction;
  unstakeTransaction: Transaction;
  cleanupTransaction?: Transaction;
}
