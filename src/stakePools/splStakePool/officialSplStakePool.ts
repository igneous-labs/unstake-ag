import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { ValidatorStakeInfo } from "@soceanfi/stake-pool-sdk";

import type { CreateSwapInstructionsParams } from "@/unstake-ag/stakePools";
import { SplStakePool } from "@/unstake-ag/stakePools/splStakePool/splStakePool";
import { decrementStakePoolIxData } from "@/unstake-ag/stakePools/splStakePool/utils";
import { CreateWithdrawStakeInstructionsParams } from "@/unstake-ag/withdrawStakePools";

export class OfficialSplStakePool extends SplStakePool {
  override createSwapInstructions(
    args: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    const ixs = super.createSwapInstructions(args);
    decrementStakePoolIxData(this.programId, ixs);
    return ixs;
  }

  override createWithdrawStakeInstructions(
    args: CreateWithdrawStakeInstructionsParams,
  ): TransactionInstruction[] {
    const ixs = super.createWithdrawStakeInstructions(args);
    decrementStakePoolIxData(this.programId, ixs);
    return ixs;
  }

  override findTransientStakeAccount(
    validatorStakeInfo: ValidatorStakeInfo,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("transient"),
        validatorStakeInfo.voteAccountAddress.toBuffer(),
        this.stakePoolAddr.toBuffer(),
        Buffer.from(
          validatorStakeInfo.transientSeedSuffixStart.toArray("le", 8),
        ),
      ],
      this.programId,
    )[0];
  }
}
