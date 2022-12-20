import type {
  AccountInfo,
  AddressLookupTableAccount,
  Keypair,
  PublicKey,
  Signer,
  Transaction,
} from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";
import type { Jupiter } from "@jup-ag/core";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type { PubkeyFromSeed } from "@/unstake-ag/common";
import type { UnstakeRoute, UnstakeXSolRoute } from "@/unstake-ag/route";
import type { StakePool } from "@/unstake-ag/stakePools";
import type { StakePoolLabel } from "@/unstake-ag/unstakeAg/labels";
import type { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

export type HybridPool = StakePool & WithdrawStakePool;

/**
 * Exclude certain StakePools from the route search
 *
 * e.g. { "Marinade": true, "Socean": true }
 */
export type StakePoolsToExclude = {
  [label in StakePoolLabel]?: boolean;
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

  /**
   * Produces a legacy transaction
   * (Ledger currently doesn't support Versioned Transaction)
   */
  asLegacyTransaction?: boolean;
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

  /**
   * Current epoch. If not provided, computeRoutes()
   * will call getEpochInfo() to fetch it
   */
  currentEpoch?: number;

  stakePoolsToExclude?: StakePoolsToExclude;
};

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

  /**
   * Set to true to exclude checking against on-chain data
   * to determine whether the user has the required
   * associated token accounts for an unstake,
   * including wrapped SOL.
   *
   * Defaults to false
   */
  assumeAtasExist?: boolean;

  /**
   * Optionally pass in a precomputed PubkeyFromSeed to serve
   * as the split stake account for partial unstakes to avoid
   * computing one live by checking against on-chain data
   */
  splitStakeAccount?: PubkeyFromSeed;

  /**
   * Produces a legacy transaction
   * (Ledger currently doesn't support Versioned Transaction)
   */
  asLegacyTransaction?: boolean;
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

  /**
   * Set to true to exclude checking against on-chain data
   * to determine whether the user has the required
   * associated token accounts for an unstake,
   * including wrapped SOL.
   *
   * Defaults to false
   */
  assumeAtasExist?: boolean;

  /**
   * Optionally pass in a precomputed PubkeyFromSeed or Keypair to serve
   * as the split stake account for withdrawn stake to avoid
   * computing one live
   */
  newStakeAccount?: PubkeyFromSeed | Keypair;

  /**
   * Produces a legacy transaction
   * (Ledger currently doesn't support Versioned Transaction)
   */
  asLegacyTransaction?: boolean;
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

export interface ExchangeReturnV0 {
  unstakeTransaction: VersionedTransaction;
  luts: AddressLookupTableAccount[];
}
