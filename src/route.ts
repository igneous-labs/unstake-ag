import type { AccountInfo, PublicKey } from "@solana/web3.js";
import type { RouteInfo } from "@jup-ag/core";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";

import type { StakePool } from "@/unstake-ag/stakePools";
import type { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

export interface StakeAccInputRoute {
  stakePool: StakePool;

  /**
   * Amount of staked lamports to be unstaked.
   * Can be <= a stake account's lamports.
   * If < stake account's lamports, a split must be
   * added to the setupTransactions
   */
  inAmount: bigint;

  /**
   * Amount of stakePool.outputToken atomics that this route
   * will output.
   */
  outAmount: bigint;

  /**
   * Any additional SOL that needs to be paid as rent-exempt fees for
   * new accounts to be created
   */
  additionalRentLamports: bigint;
}

export interface UnstakeRoute {
  stakeAccInput: StakeAccInputRoute;

  /**
   * Additional jup swap route to follow if stakeAccInput does not end
   * in `So11111111111111111111111111111111111111112`
   */
  jup?: RouteInfo;
}

export interface WithdrawStakeRoute {
  withdrawStakePool: WithdrawStakePool;

  /**
   * Amount of withdraw stake tokens to be unstaked
   */
  inAmount: bigint;

  /**
   * Amount of lamports in the stake account that this
   * route will output
   */
  outAmount: bigint;

  /**
   * The stake account of the withdrawStakePool to split stake from
   */
  stakeSplitFrom: PublicKey;

  /**
   * Any additional SOL that needs to be paid as rent-exempt fees for
   * new accounts to be created
   */
  additionalRentLamports: bigint;
}

export type UnstakeXSolRouteJupDirect = {
  jup: RouteInfo;
};

export type UnstakeXSolRouteWithdrawStake = {
  withdrawStake: WithdrawStakeRoute;
  /**
   * Should be `result.outputDummyStakeAccountInfo` of `WithdrawStakeQuote`
   */
  intermediateDummyStakeAccountInfo: AccountInfo<StakeAccount>;
  unstake: UnstakeRoute;
};

export type UnstakeXSolRoute =
  | UnstakeXSolRouteJupDirect
  | UnstakeXSolRouteWithdrawStake;
