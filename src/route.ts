import type { PublicKey } from "@solana/web3.js";
import type { RouteInfo } from "@jup-ag/core";

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
}

export type UnstakeXSolRouteJupDirect = {
  jup: RouteInfo;
};

export type UnstakeXSolRouteWithdrawStake = {
  withdrawStake: WithdrawStakeRoute;
  unstake: UnstakeRoute;
};

export type UnstakeXSolRoute =
  | UnstakeXSolRouteJupDirect
  | UnstakeXSolRouteWithdrawStake;
