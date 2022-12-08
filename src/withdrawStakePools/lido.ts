/* eslint-disable max-classes-per-file, @typescript-eslint/naming-convention */

import * as BufferLayout from "@solana/buffer-layout";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  PublicKey,
  StakeProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { AccountInfoMap } from "@jup-ag/core/dist/lib/amm";
import type {
  AccountInfoV2,
  ValidatorsList,
  ValidatorV2,
} from "@lidofinance/solido-sdk/dist/esm/core/src/types";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import BN from "bn.js";
import { deserializeUnchecked } from "borsh";

import type { WithdrawStakePoolLabel } from "@/unstake-ag/unstakeAg/labels";
import { dummyStakeAccountInfo } from "@/unstake-ag/unstakeAg/utils";
import type {
  CreateWithdrawStakeInstructionsParams,
  WithdrawStakePool,
  WithdrawStakeQuote,
  WithdrawStakeQuoteParams,
} from "@/unstake-ag/withdrawStakePools";
import {
  isNewStakeAccountKeypair,
  WITHDRAW_STAKE_QUOTE_FAILED,
} from "@/unstake-ag/withdrawStakePools/utils";

// THE TYPES LIE, PublicKey FIELDS AREN'T ACTUALLY PublicKeys,
// BUT ARE SIMPLY BYTE ARRAYS
// make sure to new PublicKey() anything
type Solido = AccountInfoV2;

type ExchangeRateDeser = Solido["exchange_rate"];

export interface LidoCtorParams {
  stSolAddr: PublicKey;
  validatorsListAddr: PublicKey;
}

export class LidoWithdrawStakePool implements WithdrawStakePool {
  static MAX_WITHDRAW_BUFFER_LAMPORTS: BN = new BN(10_000_000_000);

  static MINIMUM_STAKE_ACCOUNT_BALANCE_LAMPORTS: BN = new BN(1_000_000_000).add(
    STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS,
  );

  label: WithdrawStakePoolLabel = "Lido";

  mustUseKeypairForSplitStake: boolean = true;

  withdrawStakeToken: PublicKey;

  // cached state
  solido: Solido | null;

  validatorsList: ValidatorsList | null;

  // addr/pda cache
  programId: PublicKey;

  solidoAddr: PublicKey;

  validatorsListAddr: PublicKey;

  stakeAuthorityAddress: PublicKey;

  // following jup convention for ctor args
  constructor(
    stateAddr: PublicKey,
    // just pass in an AccountInfo with the right pubkey and owner
    // and not use the data since we're gonna call fetch all accounts and update() anyway
    stateAccountInfo: AccountInfo<Buffer>,
    { stSolAddr, validatorsListAddr }: LidoCtorParams,
  ) {
    this.programId = stateAccountInfo.owner;
    this.solidoAddr = stateAddr;
    this.withdrawStakeToken = stSolAddr;

    this.solido = null;
    this.validatorsList = null;

    [this.stakeAuthorityAddress] = PublicKey.findProgramAddressSync(
      [this.solidoAddr.toBuffer(), Buffer.from("stake_authority")],
      this.programId,
    );
    this.validatorsListAddr = validatorsListAddr;
  }

  createWithdrawStakeInstructions({
    payer,
    withdrawerAuth,
    stakerAuth,
    newStakeAccount,
    tokenAmount,
    srcTokenAccount,
    srcTokenAccountAuth,
    stakeSplitFrom,
  }: CreateWithdrawStakeInstructionsParams): TransactionInstruction[] {
    if (!this.solido) {
      throw new SolidoNotFetchedError();
    }
    if (!this.validatorsList) {
      throw new ValidatorsListNotFetchedError();
    }
    if (!isNewStakeAccountKeypair(newStakeAccount)) {
      throw new SplitStakeAccMustBeKeypairError();
    }
    if (
      !payer.equals(srcTokenAccountAuth) ||
      !withdrawerAuth.equals(srcTokenAccountAuth) ||
      !stakerAuth.equals(srcTokenAccountAuth)
    ) {
      throw new CannotCrossTransferError();
    }
    // TODO: probably more efficient to pass this in as param
    const validatorIndex = this.validatorsList.entries.findIndex((v) =>
      this.findStakeAccountAddressStake(v).equals(stakeSplitFrom),
    );
    if (validatorIndex === -1) {
      throw new ValidatorNotFoundError();
    }
    const validator = this.validatorsList.entries[validatorIndex];
    if (!validator) {
      throw new ValidatorNotFoundError();
    }
    const voter = validator.vote_account_address;
    const keys = [
      {
        pubkey: this.solidoAddr,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: srcTokenAccountAuth,
        isSigner: true,
        isWritable: false,
      },
      {
        pubkey: srcTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: this.withdrawStakeToken,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: voter,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: stakeSplitFrom,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: newStakeAccount.publicKey,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: this.stakeAuthorityAddress,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: this.validatorsListAddr,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: StakeProgram.programId, isSigner: false, isWritable: false },
    ];

    const dataLayout = BufferLayout.struct([
      // @ts-ignore
      BufferLayout.u8("instruction"),
      // @ts-ignore
      BufferLayout.nu64("amount"),
      // @ts-ignore
      BufferLayout.u32("validatorIndex"),
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 23, // WithdrawV2
        amount: new BN(tokenAmount.toString()),
        validatorIndex,
      },
      data,
    );
    return [
      new TransactionInstruction({
        keys,
        data,
        programId: this.programId,
      }),
    ];
  }

  getWithdrawStakeQuote({
    currentEpoch,
    tokenAmount,
  }: WithdrawStakeQuoteParams): WithdrawStakeQuote {
    if (!this.solido) {
      throw new SolidoNotFetchedError();
    }
    if (!this.validatorsList) {
      throw new ValidatorsListNotFetchedError();
    }
    const { exchange_rate } = this.solido;
    const currentEpochBN = new BN(currentEpoch);
    // TODO: handle permissionless update in setup.
    // not doing this for now because then we will need to call
    // getEpochInfo() in exchangeXSol()
    if (exchange_rate.computed_in_epoch.lt(currentEpochBN)) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }

    const solToWithdraw = exchangeStSol(
      exchange_rate,
      new BN(tokenAmount.toString()),
    );
    const validatorV2 = this.getHeaviestValidatorStakeAccount();
    if (!validatorV2) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }
    const { stake_accounts_balance, vote_account_address: voter } = validatorV2;
    // lido allows max 10% + 10 SOL withdrawal
    const maxWithdrawAmount = stake_accounts_balance
      .div(new BN(10))
      .add(LidoWithdrawStakePool.MAX_WITHDRAW_BUFFER_LAMPORTS);
    if (solToWithdraw.gt(maxWithdrawAmount)) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }
    // cannot put stake account below MINIMUM_STAKE_ACCOUNT_BALANCE
    const remainingBalance = stake_accounts_balance.sub(solToWithdraw);
    if (
      remainingBalance.lt(
        LidoWithdrawStakePool.MINIMUM_STAKE_ACCOUNT_BALANCE_LAMPORTS,
      )
    ) {
      return WITHDRAW_STAKE_QUOTE_FAILED;
    }
    const stakeSplitFrom = this.findStakeAccountAddressStake(validatorV2);
    // lido calls allocate() without transferring rent-exempt:
    // (solana_program::stake::instruction::split):
    // https://github.com/solana-labs/solana/blob/3608801a54600431720b37b53d7dbf88de4ead24/sdk/program/src/stake/instruction.rs#L412
    // This means lamports = solToWithdraw, delegation.stake = solToWithdraw - RENT_EXEMPT.
    // See: https://github.com/solana-labs/solana/blob/3608801a54600431720b37b53d7dbf88de4ead24/programs/stake/src/stake_state.rs#L692-L696
    return {
      result: {
        additionalRentLamports: BigInt(0),
        stakeSplitFrom,
        outputDummyStakeAccountInfo: dummyStakeAccountInfo({
          currentEpoch: currentEpochBN,
          lamports: Number(solToWithdraw),
          stakeState: "active",
          voter,
        }),
      },
    };
  }

  getAccountsForUpdate(): PublicKey[] {
    return [this.solidoAddr, this.validatorsListAddr];
  }

  update(accountInfoMap: AccountInfoMap): void {
    const solido = accountInfoMap.get(this.solidoAddr.toString());
    if (solido) {
      this.solido = deserializeSolido(solido.data);
    }
    const validatorsList = accountInfoMap.get(
      this.validatorsListAddr.toString(),
    );
    if (validatorsList) {
      this.validatorsList = deserializeValidatorsList(validatorsList.data);
    }
  }

  /**
   * The one exported by @chorusone/solido.js looks at the actual lamports
   * of the stake accounts. Using the data in this.solido should suffice
   *
   * Assumes this.validatorsList already fetched
   */
  private getHeaviestValidatorStakeAccount(): ValidatorV2 | null {
    const { entries } = this.validatorsList!;
    // edge-case: 0 validators
    if (entries.length === 0) {
      return null;
    }
    let heaviest = entries[0];
    for (let i = 1; i < entries.length; i++) {
      const curr = entries[i];
      if (effectiveStakeBalance(curr).gt(effectiveStakeBalance(heaviest))) {
        heaviest = curr;
      }
    }
    return heaviest;
  }

  /**
   * See https://github.com/ChorusOne/solido/blob/7d74b094c6a96486257e14d3c89e011c5d00fce6/program/src/state.rs#L750
   * @param param0
   * @returns
   */
  private findStakeAccountAddressStake({
    stake_seeds: { begin },
    vote_account_address: vote,
  }: ValidatorV2): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        this.solidoAddr.toBuffer(),
        new PublicKey(vote).toBuffer(),
        Buffer.from("validator_stake_account"),
        Buffer.from(begin.toArray("le", 8)),
      ],
      this.programId,
    )[0];
  }
}

/**
 * See https://github.com/ChorusOne/solido/blob/7d74b094c6a96486257e14d3c89e011c5d00fce6/program/src/state.rs#L651
 * @param param0
 * @returns
 */
function effectiveStakeBalance({
  stake_accounts_balance,
  unstake_accounts_balance,
}: ValidatorV2): BN {
  return stake_accounts_balance.sub(unstake_accounts_balance);
}

/**
 * See https://github.com/ChorusOne/solido/blob/7d74b094c6a96486257e14d3c89e011c5d00fce6/program/src/state.rs#L165
 * @param param0
 * @param amountStLamports
 * @returns
 */
function exchangeStSol(
  { st_sol_supply, sol_balance }: ExchangeRateDeser,
  amountStLamports: BN,
): BN {
  if (st_sol_supply.isZero()) {
    throw new ZeroStSolSupplyError();
  }
  return amountStLamports.mul(sol_balance).div(st_sol_supply);
}

class SolidoNotFetchedError extends Error {
  constructor() {
    super("solido not fetched");
  }
}

class ValidatorsListNotFetchedError extends Error {
  constructor() {
    super("lido validators list not fetched");
  }
}

class ZeroStSolSupplyError extends Error {
  constructor() {
    super("stSOL supply is zero");
  }
}

class SplitStakeAccMustBeKeypairError extends Error {
  constructor() {
    super("stake accounts split from lido must be keypair");
  }
}

class CannotCrossTransferError extends Error {
  constructor() {
    super(
      "Lido only allows payer and stakeAuth to be the stSOL token account owner",
    );
  }
}

class ValidatorNotFoundError extends Error {
  constructor() {
    super("Validator not found for given stakeSplitFrom address");
  }
}

// Lido SDK doesnt export the raw borsh schema so copy pasta here

class Lido {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class SeedRange {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class ValidatorClass {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class RewardDistribution {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class FeeRecipients {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}
class ExchangeRate {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class Metrics {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class LamportsHistogram {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class WithdrawMetric {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

const accountInfoV2Scheme = new Map([
  [
    ExchangeRate,
    {
      kind: "struct",
      fields: [
        ["computed_in_epoch", "u64"],
        ["st_sol_supply", "u64"],
        ["sol_balance", "u64"],
      ],
    },
  ],
  [
    LamportsHistogram,
    {
      kind: "struct",
      fields: [
        ["counts1", "u64"],
        ["counts2", "u64"],
        ["counts3", "u64"],
        ["counts4", "u64"],
        ["counts5", "u64"],
        ["counts6", "u64"],
        ["counts7", "u64"],
        ["counts8", "u64"],
        ["counts9", "u64"],
        ["counts10", "u64"],
        ["counts11", "u64"],
        ["counts12", "u64"],
        ["total", "u64"],
      ],
    },
  ],
  [
    WithdrawMetric,
    {
      kind: "struct",
      fields: [
        ["total_st_sol_amount", "u64"],
        ["total_sol_amount", "u64"],
        ["count", "u64"],
      ],
    },
  ],
  [
    Metrics,
    {
      kind: "struct",
      fields: [
        ["fee_treasury_sol_total", "u64"],
        ["fee_validation_sol_total", "u64"],
        ["fee_developer_sol_total", "u64"],
        ["st_sol_appreciation_sol_total", "u64"],
        ["fee_treasury_st_sol_total", "u64"],
        ["fee_validation_st_sol_total", "u64"],
        ["fee_developer_st_sol_total", "u64"],
        ["deposit_amount", LamportsHistogram],
        ["withdraw_amount", WithdrawMetric],
      ],
    },
  ],
  [
    RewardDistribution,
    {
      kind: "struct",
      fields: [
        ["treasury_fee", "u32"],
        ["developer_fee", "u32"],
        ["st_sol_appreciation", "u32"],
      ],
    },
  ],
  [
    FeeRecipients,
    {
      kind: "struct",
      fields: [
        ["treasury_account", [32]],
        ["developer_account", [32]],
      ],
    },
  ],
  [
    Lido,
    {
      kind: "struct",
      fields: [
        ["account_type", "u8"],

        ["lido_version", "u8"],

        ["manager", [32]],

        ["st_sol_mint", [32]],

        ["exchange_rate", ExchangeRate],

        ["sol_reserve_account_bump_seed", "u8"],
        ["stake_authority_bump_seed", "u8"],
        ["mint_authority_bump_seed", "u8"],

        ["reward_distribution", RewardDistribution],

        ["fee_recipients", FeeRecipients],

        ["metrics", Metrics],

        ["validator_list", [32]],

        ["maintainer_list", [32]],

        ["max_commission_percentage", "u8"],
      ],
    },
  ],
]);

function deserializeSolido(data: Buffer): Solido {
  return deserializeUnchecked(accountInfoV2Scheme, Lido, data) as Solido;
}

class AccountList {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

class ListHeader {
  constructor(data: unknown) {
    Object.assign(this, data);
  }
}

const validatorsSchema = new Map([
  [
    ListHeader,
    {
      kind: "struct",
      fields: [
        ["account_type", "u8"],
        ["lido_version", "u8"],
        ["max_entries", "u32"],
      ],
    },
  ],
  [
    SeedRange,
    {
      kind: "struct",
      fields: [
        ["begin", "u64"],
        ["end", "u64"],
      ],
    },
  ],
  [
    ValidatorClass,
    {
      kind: "struct",
      fields: [
        ["vote_account_address", [32]],
        ["stake_seeds", SeedRange],
        ["unstake_seeds", SeedRange],
        ["stake_accounts_balance", "u64"],
        ["unstake_accounts_balance", "u64"],
        ["effective_stake_balance", "u64"],
        ["active", "u8"],
      ],
    },
  ],
  [
    AccountList,
    {
      kind: "struct",
      fields: [
        ["header", ListHeader],
        ["entries", [ValidatorClass]],
      ],
    },
  ],
]);

function deserializeValidatorsList(data: Buffer): ValidatorsList {
  return deserializeUnchecked(
    validatorsSchema,
    AccountList,
    data,
  ) as ValidatorsList;
}
