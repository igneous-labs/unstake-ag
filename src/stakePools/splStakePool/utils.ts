import { PublicKey, TransactionInstruction } from "@solana/web3.js";

const ADD_VALIDATOR_TO_POOL_ENUM = 2;

/**
 * Monkey-patch data field to the correct byte for SPL stake pool instructions.
 * Because SPL 0.7.0 merged CreateValidatorStakeAccount and AddValidatorToPool into one instruction,
 * any instruction other than Initialize is offset by -1 from Socean's version.
 *
 * Modifies `ixs` array in-place
 */
export function decrementStakePoolIxData(
  stakePoolProgramId: PublicKey,
  ixs: TransactionInstruction[],
) {
  for (const ix of ixs) {
    if (ix.programId.equals(stakePoolProgramId)) {
      if (ix.data[0] >= ADD_VALIDATOR_TO_POOL_ENUM) {
        ix.data[0]--;
      }
    }
  }
}
