import {
  AccountInfo,
  PublicKey,
  StakeProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { WRAPPED_SOL_MINT } from "@jup-ag/core";
import { AccountInfoMap, Quote } from "@jup-ag/core/dist/lib/amm";
import { stakeAccountState } from "@soceanfi/solana-stake-sdk";
import {
  applyFee,
  BN,
  Fee,
  IDL_JSON as UNSTAKE_IDL_JSON,
  IdlAccounts,
  Program,
  ProtocolFeeAccount,
  Unstake,
} from "@unstake-it/sol";
import JSBI from "jsbi";

import type {
  CanAcceptStakeAccountParams,
  CreateCleanupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
  StakePoolQuoteParams,
} from "@/unstake-ag/stakePools";

export class UnstakeIt implements StakePool {
  outputToken: PublicKey = WRAPPED_SOL_MINT;

  label: string = "unstake.it";

  program: Program<Unstake>;

  // cached state
  pool: IdlAccounts<Unstake>["pool"] | null;

  protocolFee: ProtocolFeeAccount | null;

  fee: Fee | null;

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
  ) {
    const progId = poolAccountInfo.owner;
    // if last arg is undefined, anchor attemps to load defaultprovider
    this.program = new Program(
      UNSTAKE_IDL_JSON,
      progId,
      "fake-truthy-value" as any,
    );

    this.pool = null;
    this.protocolFee = null;
    this.fee = null;
    this.poolSolReservesLamports = null;

    this.poolAddr = poolAddress;

    // TODO: export sync versions of the PDA functions in @unstake-it/sol
    // and replace these with those
    [this.protocolFeeAddr] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol-fee")],
      progId,
    );
    [this.feeAddr] = PublicKey.findProgramAddressSync(
      [this.poolAddr.toBuffer(), Buffer.from("fee")],
      progId,
    );
    [this.poolSolReservesAddr] = PublicKey.findProgramAddressSync(
      [this.poolAddr.toBuffer()],
      progId,
    );
  }

  /**
   * Accepts all stake accs
   * @param
   */
  // eslint-disable-next-line class-methods-use-this
  canAcceptStakeAccount({
    stakeAccount,
  }: CanAcceptStakeAccountParams): boolean {
    return (
      stakeAccount.data.type === "initialized" ||
      stakeAccount.data.type === "delegated"
    );
  }

  // eslint-disable-next-line class-methods-use-this
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
    return [
      this.program.instruction.unstake({
        accounts: {
          payer,
          unstaker: withdrawerAuth,
          stakeAccount: stakeAccountPubkey,
          destination: destinationTokenAccount,
          poolAccount: this.poolAddr,
          poolSolReserves: this.poolSolReservesAddr,
          feeAccount: this.feeAddr,
          // TODO: export sync vers of findStakeAccountRecordAccount
          // in @unstake-it/sol
          stakeAccountRecordAccount: PublicKey.findProgramAddressSync(
            [this.poolAddr.toBuffer(), stakeAccountPubkey.toBuffer()],
            this.program.programId,
          )[0],
          protocolFeeAccount: this.protocolFeeAddr,
          protocolFeeDestination: this.protocolFee.destination,
          clock: SYSVAR_CLOCK_PUBKEY,
          stakeProgram: StakeProgram.programId,
          systemProgram: SystemProgram.programId,
        },
      }),
    ];
  }

  createCleanupInstruction({
    stakeAccountPubkey,
    stakeAccount,
    currentEpoch,
  }: CreateCleanupInstructionsParams): TransactionInstruction[] {
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (state === "active" || state === "activating") {
      return [
        this.program.instruction.deactivateStakeAccount({
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

  getQuote({ stakeAmount, unstakedAmount }: StakePoolQuoteParams): Quote {
    if (!this.fee) {
      throw new Error("fee account not fetched");
    }
    if (this.poolSolReservesLamports === null) {
      throw new Error("SOL reserves lamports not fetched");
    }
    if (!this.pool) {
      throw new Error("pool account not fetched");
    }
    const amount = JSBI.add(stakeAmount, unstakedAmount);
    const stakeAccountLamports = new BN(amount.toString());
    const solReservesLamports = new BN(this.poolSolReservesLamports);
    const estFeeDeductedLamports = applyFee(this.fee, {
      poolIncomingStake: this.pool.incomingStake,
      solReservesLamports,
      stakeAccountLamports,
    });
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
