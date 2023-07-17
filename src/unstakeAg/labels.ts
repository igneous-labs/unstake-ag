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
  | "Risk.lol";

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
  | "Risk.lol";

export type HybridPoolLabel = StakePoolLabel & WithdrawStakePoolLabel;

export type PoolLabel = StakePoolLabel | WithdrawStakePoolLabel;
