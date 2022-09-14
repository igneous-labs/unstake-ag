/* eslint-disable */

import { Amm } from "@jup-ag/core";
import {
  CanAcceptStakeAccountParams,
  StakePool,
} from "@/unstake-ag/stakePools";
import {
  AccountInfoMap,
  QuoteParams,
  Quote,
  SwapParams,
} from "@jup-ag/core/dist/lib/amm";
import {
  AccountInfo,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";

class UnstakeIt implements Amm, StakePool {
  label: string;
  id: string;
  reserveTokenMints: PublicKey[];
  shouldPrefetch: boolean;
  exactOutputSupported: boolean;
  outputToken: PublicKey;

  getAccountsForUpdate(): PublicKey[] {
    throw new Error("Method not implemented.");
  }

  update(accountInfoMap: AccountInfoMap): void {
    throw new Error("Method not implemented.");
  }

  getQuote(quoteParams: QuoteParams): Quote {
    throw new Error("Method not implemented.");
  }

  createSwapInstructions(swapParams: SwapParams): TransactionInstruction[] {
    throw new Error("Method not implemented.");
  }

  canAcceptStakeAccount(
    stakeAccount: AccountInfo<StakeAccount>,
    params: CanAcceptStakeAccountParams,
  ): boolean {
    throw new Error("Method not implemented.");
  }
}
