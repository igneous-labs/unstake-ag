import { TOKEN_PROGRAM_ID } from "@solana/spl-token-v2";
import {
  PublicKey,
  StakeAuthorizationLayout,
  StakeProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import { depositStakeInstruction } from "@soceanfi/stake-pool-sdk";

import type { CreateSwapInstructionsParams } from "@/unstake-ag/stakePools";
import { SplStakePool } from "@/unstake-ag/stakePools/splStakePool/splStakePool";

export class OfficialSplStakePool extends SplStakePool {
  override createSwapInstructions({
    stakeAccountPubkey,
    stakerAuth,
    withdrawerAuth,
    destinationTokenAccount,
    stakeAccountVotePubkey,
  }: CreateSwapInstructionsParams): TransactionInstruction[] {
    if (!this.stakePool) {
      throw new Error("stakePool not fetched");
    }

    // TODO: export sync versions of these PDA util functions
    // from stake-pool-sdk
    const [stakePoolWithdrawAuth] = PublicKey.findProgramAddressSync(
      [this.stakePoolAddr.toBuffer(), Buffer.from("withdraw")],
      this.programId,
    );
    const [validatorStakeAccount] = PublicKey.findProgramAddressSync(
      [stakeAccountVotePubkey.toBuffer(), this.stakePoolAddr.toBuffer()],
      this.programId,
    );
    const depositStakeIx = depositStakeInstruction(
      this.programId,
      this.stakePoolAddr,
      this.validatorListAddr,
      this.stakePool.depositAuthority,
      stakePoolWithdrawAuth,
      stakeAccountPubkey,
      validatorStakeAccount,
      this.stakePool.reserveStake,
      destinationTokenAccount,
      this.stakePool.managerFeeAccount,
      // no referrer
      this.stakePool.managerFeeAccount,
      this.stakePool.poolMint,
      TOKEN_PROGRAM_ID,
    );
    // monkey-patch data field to the correct byte for DepositStake
    // because SPL 0.7.0 merged CreateValidatorStakeAccount and AddValidatorToPool into one instruction,
    // so any instruction other than Initialize is offset by -1 from Socean's version
    depositStakeIx.data = Buffer.from([9]);
    return [
      ...StakeProgram.authorize({
        stakePubkey: stakeAccountPubkey,
        authorizedPubkey: stakerAuth,
        newAuthorizedPubkey: this.stakePool.depositAuthority,
        stakeAuthorizationType: StakeAuthorizationLayout.Staker,
      }).instructions,
      ...StakeProgram.authorize({
        stakePubkey: stakeAccountPubkey,
        authorizedPubkey: withdrawerAuth,
        newAuthorizedPubkey: this.stakePool.depositAuthority,
        stakeAuthorizationType: StakeAuthorizationLayout.Withdrawer,
      }).instructions,
      depositStakeIx,
    ];
  }
}
