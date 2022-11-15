/* eslint-disable max-classes-per-file */

import {
  LAMPORTS_PER_SOL,
  PublicKey,
  Struct,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AccountInfoMap, Quote } from "@jup-ag/core/dist/lib/amm";
import {
  option,
  publicKey,
  struct,
  u8,
  u16,
  u32,
  u64,
} from "@project-serum/borsh";
import {
  AccountType,
  decodeValidatorList,
  Fee,
  Lockup,
} from "@soceanfi/stake-pool-sdk";
import BN from "bn.js";
import JSBI from "jsbi";

import type {
  CanAcceptStakeAccountParams,
  CreateSwapInstructionsParams,
  StakePoolQuoteParams,
} from "@/unstake-ag/stakePools";
import { SplStakePool } from "@/unstake-ag/stakePools/splStakePool/splStakePool";
import { decrementStakePoolIxData } from "@/unstake-ag/stakePools/splStakePool/utils";

/**
 * Layouts and typdefs copied from
 * https://github.com/everstake/eversol-ts-sdk/blob/master/src/service/layouts.ts
 * with fields renamed to fit StakePoolStruct.
 * Eversol sdk doesnt re-export them
 */
export interface RateOfExchange {
  denominator: BN;
  numerator: BN;
}

/**
 * Layouts and typdefs copied from
 * https://github.com/everstake/eversol-ts-sdk/blob/master/src/service/layouts.ts
 * with fields renamed to fit StakePoolStruct.
 * Eversol sdk doesnt re-export them
 */
export class EverstakeStakePoolStruct extends Struct {
  // @ts-ignore
  accountType: AccountType;

  // @ts-ignore
  manager: PublicKey;

  // @ts-ignore
  staker: PublicKey;

  // @ts-ignore
  depositAuthority: PublicKey;

  // @ts-ignore
  withdrawBumpSeed: number;

  // @ts-ignore
  validatorList: PublicKey;

  // @ts-ignore
  reserveStake: PublicKey;

  // @ts-ignore
  poolMint: PublicKey;

  // @ts-ignore
  managerFeeAccount: PublicKey;

  // @ts-ignore
  tokenProgramId: PublicKey;

  // @ts-ignore
  totalStakeLamports: BN;

  // @ts-ignore
  poolTokenSupply: BN;

  // @ts-ignore
  lastUpdateEpoch: BN;

  // @ts-ignore
  lockup: Lockup;

  // @ts-ignore
  fee: Fee;

  // @ts-ignore
  nextEpochFee: Fee;

  // @ts-ignore
  preferredDepositValidatorVoteAddress: PublicKey;

  // @ts-ignore
  preferredWithdrawValidatorVoteAddress: PublicKey;

  // @ts-ignore
  stakeDepositFee: Fee;

  // @ts-ignore
  withdrawalFee: Fee;

  // @ts-ignore
  nextWithdrawalFee: Fee;

  // @ts-ignore
  stakeReferralFee: number;

  // @ts-ignore
  solDepositAuthority: PublicKey;

  // @ts-ignore
  solDepositFee: Fee;

  // @ts-ignore
  solReferralFee: number;

  // @ts-ignore
  solWithdrawAuthority: PublicKey;

  // @ts-ignore
  solWithdrawalFee: Fee;

  // @ts-ignore
  nextSolWithdrawalFee: Fee;

  // @ts-ignore
  lastEpochPoolTokenSupply: BN;

  // @ts-ignore
  lastEpochTotalLamports: BN;

  // @ts-ignore
  rateOfExchange: RateOfExchange;

  // @ts-ignore
  treasuryFeeAccount: PublicKey;

  // @ts-ignore
  treasuryFee: Fee;

  // @ts-ignore
  totalLamportsLiquidity: BN;

  // @ts-ignore
  maxValidatorYieldPerEpochNumerator: number;

  // @ts-ignore
  noFeeDepositThreshold: number;
}

const feeFields = [u64("denominator"), u64("numerator")];

const rateOfExchangeFields = [u64("denominator"), u64("numerator")];

const EVERSTAKE_STAKE_POOL_LAYOUT = struct<EverstakeStakePoolStruct>([
  // rustEnum(AccountTypeKind, 'accountType'),
  u8("accountType"),
  publicKey("manager"),
  publicKey("staker"),
  publicKey("depositAuthority"),
  u8("withdrawBumpSeed"),
  publicKey("validatorList"),
  publicKey("reserveStake"),
  publicKey("poolMint"),
  publicKey("managerFeeAccount"),
  publicKey("tokenProgramId"),
  u64("totalStakeLamports"),
  u64("poolTokenSupply"),
  u64("lastUpdateEpoch"),
  struct(
    [u64("unixTimestamp"), u64("epoch"), publicKey("custodian")],
    "lockup",
  ),
  struct(feeFields, "fee"),
  option(struct(feeFields), "nextEpochFee"),
  option(publicKey(), "preferredDepositValidatorVoteAddress"),
  option(publicKey(), "preferredWithdrawValidatorVoteAddress"),
  struct(feeFields, "stakeDepositFee"),
  struct(feeFields, "withdrawalFee"),
  option(struct(feeFields), "nextWithdrawalFee"),
  u8("stakeReferralFee"),
  option(publicKey(), "solDepositAuthority"),
  struct(feeFields, "solDepositFee"),
  u8("solReferralFee"),
  option(publicKey(), "solWithdrawAuthority"),
  struct(feeFields, "solWithdrawalFee"),
  option(struct(feeFields), "nextSolWithdrawalFee"),
  u64("lastEpochPoolTokenSupply"),
  u64("lastEpochTotalLamports"),
  option(struct(rateOfExchangeFields), "rateOfExchange"),
  publicKey("treasuryFeeAccount"),
  struct(feeFields, "treasuryFee"),
  u64("totalLamportsLiquidity"),
  u32("maxValidatorYieldPerEpochNumerator"),
  u16("noFeeDepositThreshold"),
]);

export class EverstakeSplStakePool extends SplStakePool {
  public static MINIMUM_DEPOSIT_LAMPORTS: number = 1_000_000;

  public static DEFAULT_VALIDATOR_YIELD_PER_EPOCH_NUMERATOR: number = 60_144;

  public static VALIDATOR_YIELD_PER_EPOCH_DENOMINATOR: number = 100_000_000;

  // @ts-ignore
  override stakePool: EverstakeStakePoolStruct | null;

  override canAcceptStakeAccount(params: CanAcceptStakeAccountParams): boolean {
    return (
      super.canAcceptStakeAccount(params) &&
      params.amountLamports >=
        BigInt(EverstakeSplStakePool.MINIMUM_DEPOSIT_LAMPORTS)
    );
  }

  override createSwapInstructions(
    args: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    const ixs = super.createSwapInstructions(args);
    decrementStakePoolIxData(this.programId, ixs);
    return ixs;
  }

  override update(accountInfoMap: AccountInfoMap): void {
    const stakePool = accountInfoMap.get(this.stakePoolAddr.toString());
    if (stakePool) {
      this.stakePool = EVERSTAKE_STAKE_POOL_LAYOUT.decode(stakePool.data);
    }
    const validatorList = accountInfoMap.get(this.validatorListAddr.toString());
    if (validatorList) {
      this.validatorList = decodeValidatorList(validatorList.data);
    }
  }

  override getQuote({
    stakeAmount,
    unstakedAmount,
  }: StakePoolQuoteParams): Quote {
    if (!this.stakePool) {
      throw new Error("stakePool not fetched");
    }
    const amount = JSBI.add(stakeAmount, unstakedAmount);
    // eversol charges:
    // - sol deposit fee on rent lamports
    // - stake deposit fee up to no_fee_deposit_threshold
    // See: https://github.com/everstake/solana-program-library/blob/22534fe3885e698598e92b2fe20da3a8adbfc5ff/stake-pool/program/src/processor.rs#L2123-L2159
    const poolTokensMinted = this.convertAmountOfLamportsToAmountOfPoolTokens(
      this.calculateDepositAmountByRewardSimulation(amount),
    );
    const stakedAmountChargeable = this.stakePool.noFeeDepositThreshold
      ? JSBI.BigInt(
          Math.min(
            LAMPORTS_PER_SOL * this.stakePool.noFeeDepositThreshold,
            JSBI.toNumber(stakeAmount),
          ),
        )
      : stakeAmount;
    const stakeDepositFee = applyFee(
      this.stakePool.stakeDepositFee,
      this.convertAmountOfLamportsToAmountOfPoolTokens(stakedAmountChargeable),
    );
    const solDepositFee = applyFee(
      this.stakePool.solDepositFee,
      this.convertAmountOfLamportsToAmountOfPoolTokens(unstakedAmount),
    );
    const feeAmount = JSBI.add(stakeDepositFee, solDepositFee);
    const outAmount = JSBI.subtract(poolTokensMinted, feeAmount);
    return {
      notEnoughLiquidity: false,
      minOutAmount: outAmount,
      inAmount: amount,
      outAmount,
      feeAmount,
      feeMint: this.outputToken.toString(),
      feePct: JSBI.toNumber(feeAmount) / JSBI.toNumber(poolTokensMinted),
      priceImpactPct: 0,
    };
  }

  /**
   * See: https://github.com/everstake/solana-program-library/blob/22534fe3885e698598e92b2fe20da3a8adbfc5ff/stake-pool/program/src/state.rs#L558
   * Assumes this.stakePool already fetched
   *
   * @param totalDepositLamports
   */
  private calculateDepositAmountByRewardSimulation(
    totalDepositLamports: JSBI,
  ): JSBI {
    const stakePool = this.stakePool!;
    const numerator =
      stakePool.maxValidatorYieldPerEpochNumerator === 0
        ? EverstakeSplStakePool.DEFAULT_VALIDATOR_YIELD_PER_EPOCH_NUMERATOR
        : stakePool.maxValidatorYieldPerEpochNumerator;
    const denominator = JSBI.BigInt(
      EverstakeSplStakePool.VALIDATOR_YIELD_PER_EPOCH_DENOMINATOR,
    );
    return JSBI.divide(
      JSBI.multiply(
        totalDepositLamports,
        JSBI.subtract(denominator, JSBI.BigInt(numerator.toString())),
      ),
      denominator,
    );
  }

  /**
   * See: https://github.com/everstake/solana-program-library/blob/22534fe3885e698598e92b2fe20da3a8adbfc5ff/stake-pool/program/src/state.rs#L186
   * Assumes this.stakePool already fetched
   *
   * @param lamports
   */
  private convertAmountOfLamportsToAmountOfPoolTokens(lamports: JSBI): JSBI {
    const { rateOfExchange } = this.stakePool!;
    if (!rateOfExchange) {
      return lamports;
    }
    return JSBI.divide(
      JSBI.multiply(
        lamports,
        JSBI.BigInt(rateOfExchange.denominator.toString()),
      ),
      JSBI.BigInt(rateOfExchange.numerator.toString()),
    );
  }
}

/**
 *
 * @param fee
 * @param amount
 * @returns number of token atomics to subtract from `amount` as fee
 */
function applyFee(fee: Fee, amount: JSBI): JSBI {
  if (fee.denominator.isZero()) return JSBI.BigInt(0);
  return JSBI.divide(
    JSBI.multiply(amount, JSBI.BigInt(fee.numerator.toString())),
    JSBI.BigInt(fee.denominator.toString()),
  );
}
