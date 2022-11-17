import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Fee } from "@soceanfi/stake-pool-sdk";
import JSBI from "jsbi";

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

/**
 * amount * fee.num / fee.denom
 * @param fee
 * @param amount
 * @returns number of token atomics to subtract from `amount` as fee
 */
export function applyStakePoolFeeJSBI(fee: Fee, amount: JSBI): JSBI {
  if (fee.denominator.isZero()) return JSBI.BigInt(0);
  return JSBI.divide(
    JSBI.multiply(amount, JSBI.BigInt(fee.numerator.toString())),
    JSBI.BigInt(fee.denominator.toString()),
  );
}

export function applyStakePoolFeeBigInt(fee: Fee, amount: bigint): bigint {
  if (fee.denominator.isZero()) return BigInt(0);
  return (
    (amount * BigInt(fee.numerator.toString())) /
    BigInt(fee.denominator.toString())
  );
}
