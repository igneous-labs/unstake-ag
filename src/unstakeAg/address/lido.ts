import { PublicKey } from "@solana/web3.js";

import type { AddressMap } from "@/unstake-ag/unstakeAg/address";

export type LidoAccounts = {
  program: PublicKey;
  solido: PublicKey;
  stakePoolToken: PublicKey;
};

// lido has no official devnet/testnet deployment:
// https://docs.solana.lido.fi/deployments/#testnet

const LIDO_PROGRAM = new PublicKey(
  "CrX7kMhLC3cSsXJdT7JDgqrRVWGnUpX3gfEfxxU2NVLi",
);
const SOLIDO = new PublicKey("49Yi1TKkNyYjPAFdR9LBvoHcUjuPX4Df5T5yv39w2XTn");
const STSOL = new PublicKey("7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj");

const LIDO_ADDRESS_MAP_ENTRY = {
  program: LIDO_PROGRAM,
  solido: SOLIDO,
  stakePoolToken: STSOL,
};

export const LIDO_ADDRESS_MAP: AddressMap<LidoAccounts> = {
  devnet: LIDO_ADDRESS_MAP_ENTRY,
  testnet: LIDO_ADDRESS_MAP_ENTRY,
  "mainnet-beta": LIDO_ADDRESS_MAP_ENTRY,
};
