import { RouteInfo } from "@jup-ag/core";

import { StakePool } from "@/unstake-ag/stakePools";

export interface StakeAccInputRoute {
  stakePool: StakePool;

  /**
   * Amount of staked lamports to be unstaked.
   * Can be <= a stake account's lamports.
   * If < stake account's lamports, a split must be
   * added to the setupTransactions
   */
  inAmount: BigInt;

  /**
   * Amount of stakePool.outputToken atomics that this route
   * will output.
   */
  outAmount: BigInt;
}

export interface UnstakeRoute {
  stakeAccInput: StakeAccInputRoute;

  /**
   * Additional jup swap route to follow if stakeAccInput does not end
   * in `So11111111111111111111111111111111111111112`
   */
  jup?: RouteInfo;
}
