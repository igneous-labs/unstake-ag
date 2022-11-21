/* eslint-disable max-classes-per-file */

import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  PublicKey,
  StakeAuthorizationLayout,
  StakeProgram,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import type { AccountInfoMap } from "@jup-ag/core/dist/lib/amm";
import { stakeAccountState } from "@soceanfi/solana-stake-sdk";
// TODO: verify that @soceanfi/stake-pool-sdk deserialization is still compatible with SPL stake pool 0.7.0
import {
  calcStakeDeposit,
  decodeStakePool,
  decodeValidatorList,
  depositStakeInstruction,
  Numberu64,
  STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS,
  StakePool as SplStakePoolStruct,
  ValidatorList,
  ValidatorStakeInfo,
  withdrawStakeInstruction,
} from "@soceanfi/stake-pool-sdk";
import BN from "bn.js";
import JSBI from "jsbi";

import type {
  CanAcceptStakeAccountParams,
  CreateSetupInstructionsParams,
  CreateSwapInstructionsParams,
  StakePool,
  StakePoolQuoteParams,
  StakeQuote,
} from "@/unstake-ag/stakePools";
import { applyStakePoolFeeBigInt } from "@/unstake-ag/stakePools/splStakePool/utils";
import {
  KNOWN_SPL_STAKE_POOL_PROGRAM_IDS_STR,
  KnownSplStakePoolProgramIdStr,
} from "@/unstake-ag/unstakeAg/address";
import type { HybridPoolLabel } from "@/unstake-ag/unstakeAg/labels";
import {
  dummyStakeAccountInfo,
  isLockupInForce,
  STAKE_STATE_LEN,
} from "@/unstake-ag/unstakeAg/utils";
import {
  CreateWithdrawStakeInstructionsParams,
  isNewStakeAccountKeypair,
  newStakeAccountPubkey,
  WITHDRAW_STAKE_QUOTE_FAILED,
  WithdrawStakePool,
  WithdrawStakeQuote,
  WithdrawStakeQuoteParams,
} from "@/unstake-ag/withdrawStakePools";

export interface SplStakePoolCtorParams {
  validatorListAddr: PublicKey;
  outputToken: PublicKey;
  label: HybridPoolLabel;
}

export abstract class SplStakePool implements StakePool, WithdrawStakePool {
  mustUseKeypairForSplitStake: boolean = false;

  outputToken: PublicKey;

  withdrawStakeToken: PublicKey;

  label: HybridPoolLabel;

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
    { validatorListAddr, outputToken, label }: SplStakePoolCtorParams,
  ) {
    const programId = stakePoolAccountInfo.owner;
    const stakePoolProgramIdStr =
      programId.toString() as KnownSplStakePoolProgramIdStr;
    if (!KNOWN_SPL_STAKE_POOL_PROGRAM_IDS_STR.includes(stakePoolProgramIdStr)) {
      throw new Error(
        `Unknown SPL stake pool program id ${stakePoolProgramIdStr}`,
      );
    }

    this.outputToken = outputToken;
    this.withdrawStakeToken = outputToken;
    this.label = label;

    this.stakePool = null;
    this.validatorList = null;

    this.programId = programId;
    this.stakePoolAddr = stakePoolAddr;
    this.validatorListAddr = validatorListAddr;
  }

  /**
   * SPL stake pools only accept:
   * - active stake accounts (can cancel deactivation in setup)
   * - staked to validators in the validator list
   * - no lockup
   * @param param0
   */
  canAcceptStakeAccount({
    stakeAccount,
    currentEpoch,
  }: CanAcceptStakeAccountParams): boolean {
    if (!this.validatorList) {
      throw new ValidatorListNotFetchedError();
    }
    if (!this.stakePool) {
      throw new StakePoolNotFetchedError();
    }
    // TODO: handle permissionless update in setup.
    // not doing this for now because there's potentially
    // a lot of validator stake accounts to update
    if (!this.isUpdated(currentEpoch)) {
      return false;
    }
    if (isLockupInForce(stakeAccount.data, currentEpoch)) {
      return false;
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

  // eslint-disable-next-line class-methods-use-this
  createSetupInstructions({
    currentEpoch,
    stakeAccount,
    stakeAccountPubkey,
  }: CreateSetupInstructionsParams): TransactionInstruction[] {
    // reactivate if deactivating
    const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
    if (state === "deactivating") {
      if (!stakeAccount.data.info.stake) {
        throw new Error("stakeAccount.data.info.stake null");
      }
      return StakeProgram.delegate({
        authorizedPubkey: stakeAccount.data.info.meta.authorized.staker,
        stakePubkey: stakeAccountPubkey,
        votePubkey: stakeAccount.data.info.stake.delegation.voter,
      }).instructions;
    }
    return [];
  }

  createSwapInstructions({
    stakeAccountPubkey,
    stakerAuth,
    withdrawerAuth,
    destinationTokenAccount,
    stakeAccountVotePubkey,
    feeAccount: referrer,
  }: CreateSwapInstructionsParams): TransactionInstruction[] {
    if (!this.stakePool) {
      throw new StakePoolNotFetchedError();
    }

    const stakePoolWithdrawAuth = this.findStakePoolWithdrawAuth();

    const validatorStakeAccount = this.findValidatorStakeAccount(
      stakeAccountVotePubkey,
    );

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
      depositStakeInstruction(
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
        referrer ?? this.stakePool.managerFeeAccount,
        this.stakePool.poolMint,
        TOKEN_PROGRAM_ID,
      ),
    ];
  }

  // eslint-disable-next-line class-methods-use-this
  createCleanupInstruction(): TransactionInstruction[] {
    return [];
  }

  getAccountsForUpdate(): PublicKey[] {
    return [this.stakePoolAddr, this.validatorListAddr];
  }

  update(accountInfoMap: AccountInfoMap): void {
    const stakePool = accountInfoMap.get(this.stakePoolAddr.toString());
    if (stakePool) {
      this.stakePool = decodeStakePool(stakePool.data);
    }
    const validatorList = accountInfoMap.get(this.validatorListAddr.toString());
    if (validatorList) {
      this.validatorList = decodeValidatorList(validatorList.data);
    }
  }

  getQuote({ stakeAmount, unstakedAmount }: StakePoolQuoteParams): StakeQuote {
    if (!this.stakePool) {
      throw new StakePoolNotFetchedError();
    }
    const amount = JSBI.add(stakeAmount, unstakedAmount);
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
      additionalRentLamports: BigInt(0),
    };
  }

  createWithdrawStakeInstructions({
    payer,
    withdrawerAuth,
    newStakeAccount,
    tokenAmount,
    srcTokenAccount,
    srcTokenAccountAuth,
    stakeSplitFrom,
  }: CreateWithdrawStakeInstructionsParams): TransactionInstruction[] {
    if (!this.stakePool) {
      throw new StakePoolNotFetchedError();
    }
    const createAccountInstruction = isNewStakeAccountKeypair(newStakeAccount)
      ? SystemProgram.createAccount({
          fromPubkey: payer,
          newAccountPubkey: newStakeAccount.publicKey,
          lamports: STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toNumber(),
          space: STAKE_STATE_LEN,
          programId: StakeProgram.programId,
        })
      : SystemProgram.createAccountWithSeed({
          fromPubkey: payer,
          newAccountPubkey: newStakeAccount.derived,
          basePubkey: newStakeAccount.base,
          seed: newStakeAccount.seed,
          lamports: STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toNumber(),
          space: STAKE_STATE_LEN,
          programId: StakeProgram.programId,
        });
    return [
      createAccountInstruction,
      withdrawStakeInstruction(
        this.programId,
        this.stakePoolAddr,
        this.validatorListAddr,
        this.findStakePoolWithdrawAuth(),
        stakeSplitFrom,
        newStakeAccountPubkey(newStakeAccount),
        withdrawerAuth,
        srcTokenAccountAuth,
        srcTokenAccount,
        this.stakePool.managerFeeAccount,
        this.withdrawStakeToken,
        TOKEN_PROGRAM_ID,
        new Numberu64(tokenAmount.toString()),
      ),
    ];
  }

  getWithdrawStakeQuote({
    currentEpoch,
    tokenAmount,
  }: WithdrawStakeQuoteParams): WithdrawStakeQuote {
    if (!this.stakePool) {
      throw new StakePoolNotFetchedError();
    }
    if (!this.validatorList) {
      throw new ValidatorListNotFetchedError();
    }
    const { preferredWithdrawValidatorVoteAddress } = this.stakePool;
    const { validators } = this.validatorList;
    // TODO: remove once fixed in stake-pool-sdk
    // @ts-ignore
    if (validators.length === 0) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }

    // TODO: handle permissionless update in setup.
    // not doing this for now because there's potentially
    // a lot of validator stake accounts to update
    if (!this.isUpdated(currentEpoch)) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }

    const poolHasNoActive = validators.every((v) =>
      v.activeStakeLamports.isZero(),
    );

    // TODO: change to import once exported in stake-pool-sdk
    const minActiveStakeLamports = new BN(1_000_000);
    const transientUnwithdrawableLamports =
      STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.add(minActiveStakeLamports);

    // find largest validator to withdraw from
    let validatorToWithdrawFrom = validators[0];
    let liquidity = poolHasNoActive
      ? validatorToWithdrawFrom.transientStakeLamports.sub(
          transientUnwithdrawableLamports,
        )
      : validatorToWithdrawFrom.activeStakeLamports;
    for (let i = 1; i < validators.length; i++) {
      const curr = validators[i];
      const currLiq = poolHasNoActive
        ? curr.transientStakeLamports.sub(transientUnwithdrawableLamports)
        : curr.activeStakeLamports;
      if (currLiq.gt(liquidity)) {
        validatorToWithdrawFrom = curr;
        liquidity = currLiq;
      }
    }

    // if preferred validator is set, must withdraw from preferred validator unless 0
    if (preferredWithdrawValidatorVoteAddress) {
      const preferredValidator = validators.find((v) =>
        v.voteAccountAddress.equals(preferredWithdrawValidatorVoteAddress),
      );
      if (!preferredValidator) {
        // should be unreachable
        throw new Error("preferred validator not part of stake pool");
      }
      const preferredLiq = poolHasNoActive
        ? preferredValidator.transientStakeLamports.sub(
            transientUnwithdrawableLamports,
          )
        : preferredValidator.activeStakeLamports;
      if (preferredLiq.gt(new BN(0))) {
        validatorToWithdrawFrom = preferredValidator;
        liquidity = preferredLiq;
      }
    }

    const { lamportsReceived } = this.calcWithdrawalReceipt(tokenAmount);
    if (lamportsReceived === BigInt(0)) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }
    if (
      lamportsReceived < BigInt(STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toString())
    ) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }

    const stakeSplitFrom = poolHasNoActive
      ? this.findTransientStakeAccount(validatorToWithdrawFrom)
      : this.findValidatorStakeAccount(
          validatorToWithdrawFrom.voteAccountAddress,
        );
    return {
      result: {
        additionalRentLamports: BigInt(
          STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toString(),
        ),
        stakeSplitFrom,
        outputDummyStakeAccountInfo: dummyStakeAccountInfo({
          currentEpoch: new BN(currentEpoch),
          lamports: Number(lamportsReceived),
          stakeState: poolHasNoActive ? "activating" : "active",
          voter: validatorToWithdrawFrom.voteAccountAddress,
        }),
      },
    };
  }

  // TODO: export this from stake-pool-sdk
  /**
   * Assumes this.stakePool already fetched.
   * Returns lamportsReceived and stakePoolToken fee paid for a given
   * stakePoolToken withdrawal
   * @param withdrawStakeTokens
   * @returns
   */
  protected calcWithdrawalReceipt(withdrawStakeTokens: bigint): {
    lamportsReceived: bigint;
    withdrawStakeTokensFeePaid: bigint;
  } {
    const { withdrawalFee, totalStakeLamports, poolTokenSupply } =
      this.stakePool!;

    const withdrawStakeTokensFeePaid = applyStakePoolFeeBigInt(
      withdrawalFee,
      withdrawStakeTokens,
    );
    const burnt = withdrawStakeTokens - withdrawStakeTokensFeePaid;
    const num = burnt * BigInt(totalStakeLamports.toString());
    const poolTokenSupplyBI = BigInt(poolTokenSupply.toString());
    if (num < poolTokenSupplyBI || poolTokenSupply.isZero()) {
      return {
        lamportsReceived: BigInt(0),
        withdrawStakeTokensFeePaid,
      };
    }
    // on-chain logic is ceil div
    const lamportsReceived =
      (num + poolTokenSupplyBI - BigInt(1)) / poolTokenSupplyBI;
    return {
      lamportsReceived,
      withdrawStakeTokensFeePaid,
    };
  }

  // TODO: export sync versions of these PDA util functions
  // from stake-pool-sdk

  protected findStakePoolWithdrawAuth(): PublicKey {
    return PublicKey.findProgramAddressSync(
      [this.stakePoolAddr.toBuffer(), Buffer.from("withdraw")],
      this.programId,
    )[0];
  }

  protected findValidatorStakeAccount(
    stakeAccountVotePubkey: PublicKey,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [stakeAccountVotePubkey.toBuffer(), this.stakePoolAddr.toBuffer()],
      this.programId,
    )[0];
  }

  protected findTransientStakeAccount(
    validatorStakeInfo: ValidatorStakeInfo,
  ): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("transient"),
        validatorStakeInfo.voteAccountAddress.toBuffer(),
        this.stakePoolAddr.toBuffer(),
      ],
      this.programId,
    )[0];
  }

  /**
   * Assumes this.stakePool is fetched
   * @param currentEpoch
   * @returns
   */
  protected isUpdated(currentEpoch: number): boolean {
    return this.stakePool!.lastUpdateEpoch.gte(new BN(currentEpoch));
  }
}

export class StakePoolNotFetchedError extends Error {
  constructor() {
    super("stakePool not fetched");
  }
}

class ValidatorListNotFetchedError extends Error {
  constructor() {
    super("validatorList not fetched");
  }
}
