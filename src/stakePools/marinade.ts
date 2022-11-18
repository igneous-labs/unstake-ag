/* eslint-disable max-classes-per-file */

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  PublicKey,
  StakeProgram,
  Struct,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { AccountInfoMap, Quote } from "@jup-ag/core/dist/lib/amm";
// Yes, the one from jup, not marinade, because we just need to deserialize the account, which is
// MarinadeState.state and marinade sdk doesnt export just the account fields
import type { MarinadeStateResponse } from "@jup-ag/core/dist/lib/amms/marinade/marinade-state.types";
import { ValidatorRecord } from "@marinade.finance/marinade-ts-sdk/dist/src/marinade-state/borsh";
import { MarinadeFinanceProgram } from "@marinade.finance/marinade-ts-sdk/dist/src/programs/marinade-finance-program.js";
import { publicKey, struct, u8, u32, u64 } from "@project-serum/borsh";
import { stakeAccountState } from "@soceanfi/solana-stake-sdk";
import BN from "bn.js";
// NOTE: NOT @solana/buffer-layout because there's a lot of instanceof checks in there
// @ts-ignore
import { seq } from "buffer-layout";
import JSBI from "jsbi";

import type {
  CanAcceptStakeAccountParams,
  CreateSetupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
  StakePoolQuoteParams,
} from "@/unstake-ag/stakePools";
import {
  calcStakeUnstakedAmount,
  isLockupInForce,
} from "@/unstake-ag/unstakeAg/utils";

// Redefining ValidatorRecord layouts because marinade doesnt export them

const VALIDATOR_RECORD_LAYOUT = struct<ValidatorRecord>([
  publicKey("validatorAccount"),
  u64("activeBalance"),
  u32("score"),
  u64("lastStakeDeltaEpoch"),
  u8("duplicationFlagBumpSeed"),
  // marinade's internal impl of their List struct assumes ValidatorRecord is
  // 61-byte long, even though its only 53 bytes long.
  // So items are placed at offsets of i*61
  u64("_padding"),
]);

// serum's vec<> type has u32 as length,
// but marinade's List is u64
class ValidatorRecordList extends Struct {
  // @ts-ignore
  length: BN;

  // @ts-ignore
  values: ValidatorRecord[];
}

export interface MarinadeCtorParams {
  validatorRecordsAddr: PublicKey;
  stakePoolToken: PublicKey;
}

export class MarinadeStakePool implements StakePool {
  // https://github.com/marinade-finance/liquid-staking-program/blob/447f9607a8c755cac7ad63223febf047142c6c8f/programs/marinade-finance/src/stake_system/deposit_stake_account.rs#L20
  public static readonly DEPOSIT_WAIT_EPOCHS: number = 2;

  label: string = "Marinade";

  // marinade uses same keys across all clusters
  outputToken: PublicKey;

  program: MarinadeFinanceProgram;

  // cached state
  validatorRecords: ValidatorRecord[] | null;

  state: MarinadeStateResponse | null;

  // addr/pda cache
  stateAddr: PublicKey;

  validatorRecordsAddr: PublicKey;

  stakeDepositAuthority: PublicKey;

  stakeWithdrawAuthority: PublicKey;

  mSolMintAuthority: PublicKey;

  // following jup convention for ctor args
  constructor(
    stateAddr: PublicKey,
    // just pass in an AccountInfo with the right pubkey and owner
    // and not use the data since we're gonna call fetch all accounts and update() anyway
    stateAccountInfo: AccountInfo<Buffer>,
    { validatorRecordsAddr, stakePoolToken }: MarinadeCtorParams,
  ) {
    const progId = stateAccountInfo.owner;
    // if last arg is undefined, anchor attemps to load defaultprovider
    this.program = new MarinadeFinanceProgram(
      progId,
      "fake-truthy-value" as any,
    );
    this.outputToken = stakePoolToken;

    this.validatorRecords = null;
    this.state = null;

    this.stateAddr = stateAddr;
    this.validatorRecordsAddr = validatorRecordsAddr;
    [this.stakeDepositAuthority] = PublicKey.findProgramAddressSync(
      [this.stateAddr.toBuffer(), Buffer.from("deposit")],
      progId,
    );
    [this.stakeWithdrawAuthority] = PublicKey.findProgramAddressSync(
      [this.stateAddr.toBuffer(), Buffer.from("withdraw")],
      progId,
    );
    [this.mSolMintAuthority] = PublicKey.findProgramAddressSync(
      [this.stateAddr.toBuffer(), Buffer.from("st_mint")],
      progId,
    );
  }

  /**
   * Marinade stake pool only accepts:
   * - activated stake accounts (can cancel deactivation in setup)
   * - cannot have excess lamport balance (can withdraw excess in setup)
   * - no lockup
   * - staked to validators in the validator list
   * - delegation.stake >= stake_system.min_stake
   * - currentEpoch >= activation_epoch + DEPOSIT_WAIT_EPOCHS
   * - below its staking cap
   * - staker not already set to marinade's stake authority
   * - withdrawer not already set to marinade's withdraw authority
   * @param param0
   */
  canAcceptStakeAccount({
    stakeAccount,
    currentEpoch,
    amountLamports,
  }: CanAcceptStakeAccountParams): boolean {
    if (!this.state) {
      throw new Error("marinade state not yet fetched");
    }
    if (!this.validatorRecords) {
      throw new Error("validator records not yet fetched");
    }
    if (isLockupInForce(stakeAccount.data, currentEpoch)) {
      return false;
    }
    const { staker, withdrawer } = stakeAccount.data.info.meta.authorized;
    if (staker.equals(this.stakeDepositAuthority)) {
      return false;
    }
    if (withdrawer.equals(this.stakeWithdrawAuthority)) {
      return false;
    }
    const stakeState = stakeAccountState(
      stakeAccount.data,
      new BN(currentEpoch),
    );
    if (
      stakeState === "inactive" ||
      stakeState === "activating" ||
      !stakeAccount.data.info.stake
    ) {
      return false;
    }
    const { voter, activationEpoch } = stakeAccount.data.info.stake.delegation;
    if (
      currentEpoch <
      activationEpoch.toNumber() + MarinadeStakePool.DEPOSIT_WAIT_EPOCHS
    ) {
      return false;
    }
    const { stakeAmount } = calcStakeUnstakedAmount(
      amountLamports,
      stakeAccount,
      currentEpoch,
    );
    const stake = new BN(stakeAmount.toString());
    if (stake.lt(this.state.stakeSystem.minStake)) {
      return false;
    }
    if (
      stake.add(this.totalLamportsUnderControl()).gt(this.state.stakingSolCap)
    ) {
      return false;
    }
    return Boolean(
      this.validatorRecords.find((validator) =>
        validator.validatorAccount.equals(voter),
      ),
    );
  }

  // eslint-disable-next-line class-methods-use-this
  createSetupInstructions({
    currentEpoch,
    stakeAccount,
    stakeAccountPubkey,
  }: CreateSetupInstructionsParams): TransactionInstruction[] {
    const res = [];
    // reactivate if deactivating
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (state === "deactivating") {
      if (!stakeAccount.data.info.stake) {
        throw new Error("stakeAccount.data.info.stake null");
      }
      res.push(
        ...StakeProgram.delegate({
          authorizedPubkey: stakeAccount.data.info.meta.authorized.staker,
          stakePubkey: stakeAccountPubkey,
          votePubkey: stakeAccount.data.info.stake.delegation.voter,
        }).instructions,
      );
    }
    // withdraw excess lamports
    const {
      meta: { rentExemptReserve },
      stake,
    } = stakeAccount.data.info;
    if (!stake) {
      throw new Error("expected stake to be in Stake state");
    }
    const expectedLamports = rentExemptReserve.add(stake.delegation.stake);
    const excessLamports = new BN(stakeAccount.lamports).sub(expectedLamports);
    if (!excessLamports.isZero()) {
      res.push(
        ...StakeProgram.withdraw({
          authorizedPubkey: stakeAccount.data.info.meta.authorized.staker,
          stakePubkey: stakeAccountPubkey,
          toPubkey: stakeAccount.data.info.meta.authorized.withdrawer,
          lamports: excessLamports.toNumber(),
        }).instructions,
      );
    }
    return res;
  }

  createSwapInstructions({
    stakeAccountPubkey,
    stakeAccountVotePubkey,
    stakerAuth,
    payer,
    destinationTokenAccount,
  }: CreateSwapInstructionsParams): TransactionInstruction[] {
    if (!this.state) {
      throw new Error("marinade state not fetched");
    }
    if (!this.validatorRecords) {
      throw new Error("validator records not fetched");
    }
    const validatorIndex = this.validatorRecords.findIndex((v) =>
      v.validatorAccount.equals(stakeAccountVotePubkey),
    );
    if (validatorIndex < 0) {
      throw new Error("validator not part of marinade");
    }
    return [
      this.program.depositStakeAccountInstruction({
        accounts: {
          state: this.stateAddr,
          validatorList: this.validatorRecordsAddr,
          stakeList: this.state.stakeSystem.stakeList.account,
          msolMintAuthority: this.mSolMintAuthority,
          duplicationFlag: this.findDuplicationFlag(
            this.validatorRecords[validatorIndex],
          ),
          stakeAccount: stakeAccountPubkey,
          stakeAuthority: stakerAuth,
          rentPayer: payer,
          msolMint: this.outputToken,
          mintTo: destinationTokenAccount,
          clock: SYSVAR_CLOCK_PUBKEY,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          stakeProgram: StakeProgram.programId,
        },
        validatorIndex,
      }),
    ];
  }

  // eslint-disable-next-line class-methods-use-this
  createCleanupInstruction(): TransactionInstruction[] {
    return [];
  }

  getAccountsForUpdate(): PublicKey[] {
    return [this.stateAddr, this.validatorRecordsAddr];
  }

  update(accountInfoMap: AccountInfoMap): void {
    const state = accountInfoMap.get(this.stateAddr.toString());
    if (state) {
      this.state = this.program.program.coder.accounts.decode(
        "State",
        state.data,
      );
    }
    const validatorRecords = accountInfoMap.get(
      this.validatorRecordsAddr.toString(),
    );
    if (this.state && validatorRecords) {
      this.validatorRecords = struct<ValidatorRecordList>([
        u64("length"),
        seq(
          VALIDATOR_RECORD_LAYOUT,
          this.state.validatorSystem.validatorList.count,
          "values",
        ),
      ]).decode(validatorRecords.data).values;
    }
  }

  getQuote({ stakeAmount, unstakedAmount }: StakePoolQuoteParams): Quote {
    if (!this.state) {
      throw new Error("marinade state not fetched");
    }
    const amount = JSBI.add(stakeAmount, unstakedAmount);
    const marinadeTotalLamports = JSBI.BigInt(
      this.totalVirtualStakedLamports().toString(),
    );
    const mSolSupply = JSBI.BigInt(this.state.msolSupply);
    // https://github.com/marinade-finance/liquid-staking-program/blob/447f9607a8c755cac7ad63223febf047142c6c8f/programs/marinade-finance/src/stake_system/deposit_stake_account.rs#L282
    const outAmount = JSBI.divide(
      JSBI.multiply(stakeAmount, mSolSupply),
      marinadeTotalLamports,
    );
    // TODO: should we count the absorbed rent as fees?
    return {
      notEnoughLiquidity: false,
      minOutAmount: outAmount,
      inAmount: amount,
      outAmount,
      feeAmount: JSBI.BigInt(0),
      feeMint: this.outputToken.toString(),
      // Note: name is pct, but actually rate (0.0 - 1.0)
      feePct: 0,
      priceImpactPct: 0,
    };
  }

  /**
   * https://github.com/marinade-finance/liquid-staking-program/blob/a309057f1eb3413070846d34e8fd5d83e99dc1c6/programs/marinade-finance/src/state.rs#L175
   * Assumes marinade state fetched
   */
  private totalCoolingDown(): BN {
    const state = this.state!;
    return state.stakeSystem.delayedUnstakeCoolingDown.add(
      state.emergencyCoolingDown,
    );
  }

  /**
   * https://github.com/marinade-finance/liquid-staking-program/blob/a309057f1eb3413070846d34e8fd5d83e99dc1c6/programs/marinade-finance/src/state.rs#L183
   * Assumes marinade state fetched
   */
  private totalLamportsUnderControl(): BN {
    const state = this.state!;
    return state.validatorSystem.totalActiveBalance
      .add(this.totalCoolingDown())
      .add(state.availableReserveBalance);
  }

  /**
   * https://github.com/marinade-finance/liquid-staking-program/blob/a309057f1eb3413070846d34e8fd5d83e99dc1c6/programs/marinade-finance/src/state.rs#L211
   * Assumes marinade state fetched
   */
  private totalVirtualStakedLamports() {
    const state = this.state!;
    return this.totalLamportsUnderControl().sub(state.circulatingTicketBalance);
  }

  private findDuplicationFlag({
    validatorAccount,
  }: ValidatorRecord): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        this.stateAddr.toBuffer(),
        Buffer.from("unique_validator"),
        validatorAccount.toBuffer(),
      ],
      this.program.program.programId,
    )[0];
  }
}
