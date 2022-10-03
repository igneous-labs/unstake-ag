import type { Cluster, PublicKey } from "@solana/web3.js";

export type AddressMap<
  Accounts extends {
    [accountName: string]: PublicKey;
  },
> = {
  [k in Cluster]: Accounts;
};

export * from "./marinade";
export * from "./splStakePool";
export * from "./unstakeit";
