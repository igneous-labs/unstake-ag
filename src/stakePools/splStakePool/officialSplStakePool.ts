import { TransactionInstruction } from "@solana/web3.js";

import type { CreateSwapInstructionsParams } from "@/unstake-ag/stakePools";
import { SplStakePool } from "@/unstake-ag/stakePools/splStakePool/splStakePool";
import { decrementStakePoolIxData } from "@/unstake-ag/stakePools/splStakePool/utils";

export class OfficialSplStakePool extends SplStakePool {
  override createSwapInstructions(
    args: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    const ixs = super.createSwapInstructions(args);
    decrementStakePoolIxData(this.programId, ixs);
    return ixs;
  }
}
