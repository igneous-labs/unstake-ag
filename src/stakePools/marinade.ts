/* eslint-disable */

import type {
  CanAcceptStakeAccountParams,
  CreateCleanupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
  StakePoolQuoteParams,
} from "@/unstake-ag/stakePools";

import { WRAPPED_SOL_MINT } from "@jup-ag/core";
import { AccountInfoMap, Quote } from "@jup-ag/core/dist/lib/amm";
import {
  AccountInfo,
  PublicKey,
  StakeProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import JSBI from "jsbi";
import BN from "bn.js";
import {
  Marinade as MarinadeInstance,
  MarinadeState,
  MarinadeUtils,
} from "@marinade.finance/marinade-ts-sdk";
import { stakeAccountState } from "@soceanfi/solana-stake-sdk";
import { getOrCreateAssociatedTokenAccount } from "@marinade.finance/marinade-ts-sdk/dist/src/util";
import { ValidatorRecord } from "@marinade.finance/marinade-ts-sdk/dist/src/marinade-state/borsh";
// import { MarinadeFinanceProgram } from "@marinade.finance/marinade-ts-sdk/dist/src/programs/marinade-finance-program";
// import { MarinadeFinanceIdl } from "@marinade.finance/marinade-ts-sdk/dist/src/programs/idl/marinade-finance-idl";

export class Marinade implements StakePool {
  marinade = new MarinadeInstance();
  outputToken: PublicKey = WRAPPED_SOL_MINT;

  program: typeof this.marinade.marinadeFinanceProgram;

  // cached state
  validatorRecords: ValidatorRecord[];
  state: MarinadeState;
  pool: IdlAccounts<Unstake>["pool"] | null;
  protocolFee: ProtocolFeeAccount | null;
  fee: number | null;
  poolSolReservesLamports: number | null;

  // addr/pda cache
  poolAddr: PublicKey;
  protocolFeeAddr: PublicKey;
  feeAddr: PublicKey;
  poolSolReservesAddr: PublicKey;

  // following jup convention for ctor args
  constructor(
    poolAddress: PublicKey,
    // just pass in an AccountInfo with the right pubkey and owner
    // and not use the data since we're gonna call fetch all accounts and update() anyway
    poolAccountInfo: AccountInfo<Buffer>,
    state: MarinadeState,
    validatorRecords: ValidatorRecord[],
  ) {
    const progId = poolAccountInfo.owner;
    // if last arg is undefined, anchor attemps to load defaultprovider
    this.program = this.marinade.marinadeFinanceProgram;

    this.pool = null;
    this.protocolFee = null;
    this.fee = null;
    this.poolSolReservesLamports = null;

    this.poolAddr = poolAddress;

    // TODO: export sync versions of the PDA functions in @unstake-it/sol
    // and replace these with those
    this.protocolFeeAddr = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol-fee")],
      progId,
    )[0];
    this.feeAddr = PublicKey.findProgramAddressSync(
      [this.poolAddr.toBuffer(), Buffer.from("fee")],
      progId,
    )[0];
    this.poolSolReservesAddr = PublicKey.findProgramAddressSync(
      [this.poolAddr.toBuffer()],
      progId,
    )[0];

    this.state = state;
    this.validatorRecords = validatorRecords;
  }

  /**
   * Accepts all stake accs
   * @param
   */
  /**
   * Marinade stake pool only accept activated stake accounts staked to
   * validators in the validator list
   * @param param0
   */
  canAcceptStakeAccount({
    stakeAccount,
    currentEpoch,
  }: CanAcceptStakeAccountParams): boolean {
    if (!this.validatorRecords) {
      throw new Error("validator records not yet fetched");
    }
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (
      state === "inactive" ||
      state === "activating" ||
      !stakeAccount.data.info.stake
    ) {
      return false;
    }
    const { voter } = stakeAccount.data.info.stake.delegation;
    return Boolean(
      this.validatorRecords.find((validator) =>
        validator.validatorAccount.equals(voter),
      ),
    );
  }

  createSetupInstructions(): TransactionInstruction[] {
    // no need to reactivate stake acc etc because
    // unstake program accepts all stake accounts
    return [];
  }

  createSwapInstructions({
    stakeAccountPubkey,
    withdrawerAuth,
    payer,
    destinationTokenAccount,
  }: CreateSwapInstructionsParams): TransactionInstruction[] {
    if (!this.protocolFee) {
      throw new Error("protocol fee account not cached");
    }

    const ownerAddress = stakeAccountPubkey;
    const transaction = new Transaction();

    const associatedTokenAccountInfos = await getOrCreateAssociatedTokenAccount(
      this.provider,
      this.state.mSolMintAddress,
      ownerAddress,
    );
    const createAssociateTokenInstruction =
      associatedTokenAccountInfos.createAssociateTokenInstruction;
    const associatedMSolTokenAccountAddress =
      associatedTokenAccountInfos.associatedTokenAccountAddress;

    if (createAssociateTokenInstruction) {
      transaction.add(createAssociateTokenInstruction);
    }

    const liquidUnstakeInstruction =
      await this.program.liquidUnstakeInstructionBuilder({
        amountLamports,
        marinadeState: this.state,
        ownerAddress,
        associatedMSolTokenAccountAddress,
      });

    transaction.add(liquidUnstakeInstruction);

    return transaction.instructions;
  }

  createCleanupInstruction({
    stakeAccountPubkey,
    stakeAccount,
    currentEpoch,
  }: CreateCleanupInstructionsParams): TransactionInstruction[] {
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (state === "active" || state === "activating") {
      return [
        this.program.program.instruction.instruction.deactivateStakeAccount({
          accounts: {
            stakeAccount: stakeAccountPubkey,
            poolAccount: this.poolAddr,
            poolSolReserves: this.poolSolReservesAddr,
            clock: SYSVAR_CLOCK_PUBKEY,
            stakeProgram: StakeProgram.programId,
          },
        }),
      ];
    }
    return [];
  }

  getAccountsForUpdate(): PublicKey[] {
    return [
      this.poolAddr,
      this.protocolFeeAddr,
      this.feeAddr,
      this.poolSolReservesAddr,
    ];
  }

  // TODO: test this
  update(accountInfoMap: AccountInfoMap): void {
    const pool = accountInfoMap.get(this.poolAddr.toString());
    if (pool) {
      this.pool = this.program.coder.accounts.decode("Pool", pool.data);
    }
    const protocolFee = accountInfoMap.get(this.protocolFeeAddr.toString());
    if (protocolFee) {
      this.protocolFee = this.program.coder.accounts.decode(
        "ProtocolFee",
        protocolFee.data,
      );
    }
    const fee = accountInfoMap.get(this.feeAddr.toString());
    if (fee) {
      this.fee = this.program.coder.accounts.decode("Fee", fee.data);
    }
    const solReserves = accountInfoMap.get(this.poolSolReservesAddr.toString());
    if (solReserves) {
      this.poolSolReservesLamports = solReserves.lamports;
    }
  }

  getQuote({ amount }: StakePoolQuoteParams): Quote {
    if (!this.fee) {
      throw new Error("fee account not fetched");
    }
    if (this.poolSolReservesLamports === null) {
      throw new Error("SOL reserves lamports not fetched");
    }
    if (!this.pool) {
      throw new Error("pool account not fetched");
    }
    const stakeAccountLamports = new BN(amount.toString());
    const solReservesLamports = new BN(this.poolSolReservesLamports);
    const estFeeDeductedLamports = new BN(
      MarinadeUtils.unstakeNowFeeBp(
        this.fee,
        this.fee,
        new BN(this.pool.stakeAccount.toString()),
        solReservesLamports,
        stakeAccountLamports,
      ),
    );
    const outAmountBN = stakeAccountLamports.sub(estFeeDeductedLamports);
    const outAmount = JSBI.BigInt(outAmountBN.toString());
    const notEnoughLiquidity = outAmountBN.gt(solReservesLamports);
    return {
      notEnoughLiquidity,
      minOutAmount: outAmount,
      inAmount: amount,
      outAmount,
      feeAmount: JSBI.BigInt(estFeeDeductedLamports.toString()),
      feeMint: this.outputToken.toString(),
      // Note: name is pct, but actually rate (0.0 - 1.0)
      feePct:
        estFeeDeductedLamports.toNumber() / stakeAccountLamports.toNumber(),
      priceImpactPct: 0,
    };
  }
}
