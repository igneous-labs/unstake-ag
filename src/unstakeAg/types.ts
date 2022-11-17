import type {
  AccountInfo,
  PublicKey,
  Signer,
  Transaction,
} from "@solana/web3.js";
import type { Jupiter } from "@jup-ag/core";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type { UnstakeRoute, UnstakeXSolRoute } from "@/unstake-ag/route";
import type { StakePool } from "@/unstake-ag/stakePools";
import type { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

export type HybridPool = StakePool & WithdrawStakePool;

/**
 * Exclude certain stake pools from the route search
 *
 * e.g. { "Marinade": true }
 */
export type StakePoolsToExclude = {
  [label in string]?: boolean;
};

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

  /**
   * Current epoch. If not provided, computeRoutes()
   * will call getEpochInfo() to fetch it
   */
  currentEpoch?: number;

  stakePoolsToExclude?: StakePoolsToExclude;
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
   * Token account to receive optional additional fee on
   * jup swaps when `jupFeeBps` is set on `computeRoutes()`
   * and referral fees on StakePools
   */
  feeAccounts?: FeeAccounts;
}

export interface ExchangeXSolParams {
  /**
   * A route returned by `computeRoutesXSol()`
   */
  route: UnstakeXSolRoute;

  /**
   * The owner of the xSOL tokens to unstake
   */
  user: PublicKey;

  /**
   * The xSOL token account to unstake from
   */
  srcTokenAccount: PublicKey;

  /**
   * Token account to receive optional additional fee on
   * jup swaps when `jupFeeBps` is set on `computeRoutes()`
   * and referral fees on StakePools
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

export type TransactionWithSigners = {
  tx: Transaction;
  signers: Signer[];
};

export interface ExchangeReturn {
  setupTransaction?: TransactionWithSigners;
  unstakeTransaction: TransactionWithSigners;
  cleanupTransaction?: TransactionWithSigners;
}

export type ComputeRoutesXSolParams = Omit<
  Parameters<Jupiter["computeRoutes"]>[0],
  "outputMint" | "feeBps"
> & {
  /**
   * Silently ignore routes where errors were thrown
   * during computation such as failing to fetch
   * required accounts.
   *
   * Defaults to true
   */
  shouldIgnoreRouteErrors?: boolean;

  /**
   * Optional additional fee to charge on jup swaps,
   * passed as `feeBps` to `jupiter.computeRoutes()`
   *
   * Defaults to undefined
   */
  jupFeeBps?: number;

  stakePoolsToExclude?: StakePoolsToExclude;
};
