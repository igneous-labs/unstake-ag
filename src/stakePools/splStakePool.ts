/* eslint-disable */
// TODO: REMOVE THIS ESLINT-DISABLE

import type {
  CanAcceptStakeAccountParams,
  CreateSetupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
  StakePoolQuoteParams,
} from "@/unstake-ag/stakePools";
import { AccountInfoMap, Quote } from "@jup-ag/core/dist/lib/amm";
import {
  AccountInfo,
  PublicKey,
  StakeProgram,
  TransactionInstruction,
} from "@solana/web3.js";

// NOTE:
// Seems like current spl-stake-pool version [0.7.0](https://github.com/solana-labs/solana-program-library/blob/stake-pool-v0.7.0/stake-pool/program/src/processor.rs)
// is still compatible with our stake-pool-sdk for depositStake instruction
import {
  calcStakeDeposit,
  Numberu64,
  StakePool as SplStakePoolStruct,
  ValidatorList,
} from "@soceanfi/stake-pool-sdk";

// TODO: export this from the main lib in @soceanfi/stake-pool-sdk
import {
  getStakePoolFromAccountInfo,
  getValidatorListFromAccountInfo,
} from "@soceanfi/stake-pool-sdk/dist/esm/stake-pool/utils";
import { stakeAccountState } from "@soceanfi/solana-stake-sdk";
import { BN } from "bn.js";
import JSBI from "jsbi";

interface SplStakePoolCtorParams {
  validatorListAddr: PublicKey;
  outputToken: PublicKey;
}

export class SplStakePool implements StakePool {
  outputToken: PublicKey;

  // accounts cache
  stakePool: SplStakePoolStruct | null;
  validatorList: ValidatorList | null;

  // addr cache
  programId: PublicKey;
  stakePoolAddr: PublicKey;
  validatorListAddr: PublicKey;

  constructor(
    stakePoolAddr: PublicKey,
    // just pass in an AccountInfo with the right owner
    // and not use the data since we're gonna call fetch all accounts and update() anyway
    stakePoolAccountInfo: AccountInfo<Buffer>,
    { validatorListAddr, outputToken }: SplStakePoolCtorParams,
  ) {
    this.outputToken = outputToken;

    this.stakePool = null;
    this.validatorList = null;

    this.programId = stakePoolAccountInfo.owner;
    this.stakePoolAddr = stakePoolAddr;
    this.validatorListAddr = validatorListAddr;
  }

  /**
   * SPL stake pools only accept active stake accounts staked to validators
   * in the validator list
   * @param param0
   */
  canAcceptStakeAccount({
    stakeAccount,
    currentEpoch,
  }: CanAcceptStakeAccountParams): boolean {
    if (!this.validatorList) {
      throw new Error("validator list not yet fetched");
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
      this.validatorList.validators.find((validator) =>
        validator.voteAccountAddress.equals(voter),
      ),
    );
  }

  createSetupInstructions({
    currentEpoch,
    stakeAccount,
    stakeAccountPubkey,
    stakerAuth,
  }: CreateSetupInstructionsParams): TransactionInstruction[] {
    // reactivate if deactivating
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (state === "deactivating") {
      if (!stakeAccount.data.info.stake) {
        throw new Error("stakeAccount.data.info.stake null");
      }
      return StakeProgram.delegate({
        authorizedPubkey: stakerAuth,
        stakePubkey: stakeAccountPubkey,
        votePubkey: stakeAccount.data.info.stake.delegation.voter,
      }).instructions;
    }
    return [];
  }

  createSwapInstructions(
    params: CreateSwapInstructionsParams,
  ): TransactionInstruction[] {
    throw new Error("Method not implemented.");
  }

  createCleanupInstruction(): TransactionInstruction[] {
    return [];
  }

  getAccountsForUpdate(): PublicKey[] {
    return [this.stakePoolAddr, this.validatorListAddr];
  }

  update(accountInfoMap: AccountInfoMap): void {
    const stakePool = accountInfoMap.get(this.stakePoolAddr.toString());
    if (stakePool) {
      this.stakePool = getStakePoolFromAccountInfo(
        this.stakePoolAddr,
        stakePool,
      ).account.data;
    }
    const validatorList = accountInfoMap.get(this.validatorListAddr.toString());
    if (validatorList) {
      this.validatorList = getValidatorListFromAccountInfo(
        this.stakePoolAddr,
        validatorList,
      ).account.data;
    }
  }

  getQuote({ amount }: StakePoolQuoteParams): Quote {
    if (!this.stakePool) {
      throw new Error("stakePool not fetched");
    }
    const { dropletsReceived, dropletsFeePaid } = calcStakeDeposit(
      new Numberu64(amount.toString()),
      this.stakePool,
    );
    const outAmount = JSBI.BigInt(dropletsReceived.toString());
    return {
      notEnoughLiquidity: false,
      minOutAmount: outAmount,
      inAmount: amount,
      outAmount,
      feeAmount: JSBI.BigInt(dropletsFeePaid.toString()),
      feeMint: this.outputToken.toString(),
      // Note: name is pct, but actually rate (0.0 - 1.0)
      feePct:
        dropletsFeePaid.toNumber() /
        dropletsFeePaid.add(dropletsReceived).toNumber(),
      priceImpactPct: 0,
    };
  }
}
