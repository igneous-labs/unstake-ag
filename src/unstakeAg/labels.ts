export type StakePoolLabel =
  | "unstake.it"
  | "Marinade"
  | "Socean"
  | "Eversol"
  | "JPool"
  | "SolBlaze"
  | "DAOPool"
  | "Jito"
  | "Laine"
  | "Cogent"
  | "Risk.lol"
  | "mrgn";

export type WithdrawStakePoolLabel =
  | "Lido"
  | "Socean"
  | "Eversol"
  | "JPool"
  | "SolBlaze"
  | "DAOPool"
  | "Jito"
  | "Laine"
  | "Cogent"
  | "Risk.lol"
  | "mrgn";

export type HybridPoolLabel = StakePoolLabel & WithdrawStakePoolLabel;

export type PoolLabel = StakePoolLabel | WithdrawStakePoolLabel;
