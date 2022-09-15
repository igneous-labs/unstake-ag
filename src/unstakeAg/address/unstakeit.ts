import { PublicKey } from "@solana/web3.js";

import type { AddressMap } from "@/unstake-ag/unstakeAg/address";

export type UnstakeItAccounts = {
  program: PublicKey;
  pool: PublicKey;
};

export const UNSTAKE_IT_ADDRESS_MAP: AddressMap<UnstakeItAccounts> = {
  devnet: {
    program: new PublicKey("6KBz9djJAH3gRHscq9ujMpyZ5bCK9a27o3ybDtJLXowz"),
    pool: new PublicKey("379bENbU2p4vY7mPTXcEVdxwP7gNtd8wme7MDy315JrC"),
  },
  testnet: {
    program: new PublicKey("6KBz9djJAH3gRHscq9ujMpyZ5bCK9a27o3ybDtJLXowz"),
    pool: new PublicKey("5Fs8HnjzV5yys8eJwTu5g74cem8s771edtHjgRmXqrqo"),
  },
  "mainnet-beta": {
    program: new PublicKey("unpXTU2Ndrc7WWNyEhQWe4udTzSibLPi25SXv2xbCHQ"),
    pool: new PublicKey("FypPtwbY3FUfzJUtXHSyVRokVKG2jKtH29FmK4ebxRSd"),
  },
};
