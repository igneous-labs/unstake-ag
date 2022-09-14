/* eslint-disable */

import type {
  CanAcceptStakeAccountParams,
  CreateCleanupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
} from "@/unstake-ag/stakePools";
import { WRAPPED_SOL_MINT } from "@jup-ag/core";
import { AccountInfoMap, QuoteParams, Quote } from "@jup-ag/core/dist/lib/amm";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import {
  applyFee,
  BN,
  Fee,
  IdlAccounts,
  ProtocolFeeAccount,
  Unstake,
} from "@unstake-it/sol";
import JSBI from "jsbi";

export class UnstakeIt implements StakePool {
  outputToken: PublicKey = WRAPPED_SOL_MINT;

  // cached state
  protocolFee: ProtocolFeeAccount | null;
  fee: Fee | null;
  pool: IdlAccounts<Unstake>["pool"] | null;
  solReservesLamports: number | null;

  solReservesAddr: PublicKey;

  constructor() {
    // TODO
  }

  /**
   * Accepts all stake accs
   * @param
   */
  canAcceptStakeAccount({
    stakeAccount,
  }: CanAcceptStakeAccountParams): boolean {
    return (
      stakeAccount.data.type === "initialized" ||
      stakeAccount.data.type === "delegated"
    );
  }

  createSetupInstructions(): TransactionInstruction[] {
    return [];
  }

  createSwapInstructions(
    params: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    throw new Error("Method not implemented.");
  }

  createCleanupInstruction(
    params: CreateCleanupInstructionsParams,
  ): TransactionInstruction[] {
    // TODO: deactivateStakeaccount
    throw new Error("Method not implemented.");
  }

  getAccountsForUpdate(): PublicKey[] {
    throw new Error("Method not implemented.");
  }

  update(accountInfoMap: AccountInfoMap): void {
    throw new Error("Method not implemented.");
  }

  getQuote({ destinationMint, amount }: QuoteParams): Quote {
    if (!destinationMint.equals(this.outputToken)) {
      throw new Error("wrong destination mint");
    }
    if (!this.fee) {
      throw new Error("fee account not fetched");
    }
    if (this.solReservesLamports === null) {
      throw new Error("SOL reserves lamports not fetched");
    }
    if (!this.pool) {
      throw new Error("pool account not fetched");
    }
    const stakeAccountLamports = new BN(amount);
    const solReservesLamports = new BN(this.solReservesLamports);
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
