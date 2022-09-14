/* eslint-disable */

import {
  CanAcceptStakeAccountParams,
  CreateSetupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
} from "@/unstake-ag/stakePools";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

class UnstakeIt implements StakePool {
  outputToken: PublicKey;
  canAcceptStakeAccount(params: CanAcceptStakeAccountParams): boolean {
    throw new Error("Method not implemented.");
  }
  createSetupInstructions(
    params: CreateSetupInstructionsParams,
  ): TransactionInstruction[] {
    throw new Error("Method not implemented.");
  }
  createSwapInstructions(
    params: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    throw new Error("Method not implemented.");
  }
}
