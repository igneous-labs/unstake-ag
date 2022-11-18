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
import { getSolido, Solido } from "@chorusone/solido.js";
import { AccountInfoMap } from "@jup-ag/core/dist/lib/amm";
import BN from "bn.js";

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

type ValidatorPubkeyAndEntry = Solido["validators"]["entries"][number];

type ValidatorEntry = ValidatorPubkeyAndEntry["entry"];

type ExchangeRate = Solido["exchange_rate"];

export interface LidoCtorParams {
  stSolAddr: PublicKey;
}

export class LidoWithdrawStakePool implements WithdrawStakePool {
  static MAX_WITHDRAW_BUFFER_LAMPORTS: BN = new BN(10_000_000_000);

  static MINIMUM_STAKE_ACCOUNT_BALANCE_LAMPORTS: BN = new BN(1_000_000_000);

  label: WithdrawStakePoolLabel = "Lido";

  mustUseKeypairForSplitStake: boolean = true;

  withdrawStakeToken: PublicKey;

  // cached state
  solido: Solido | null;

  // addr/pda cache
  programId: PublicKey;

  solidoAddr: PublicKey;

  stakeAuthorityAddress: PublicKey;

  // following jup convention for ctor args
  constructor(
    stateAddr: PublicKey,
    // just pass in an AccountInfo with the right pubkey and owner
    // and not use the data since we're gonna call fetch all accounts and update() anyway
    stateAccountInfo: AccountInfo<Buffer>,
    { stSolAddr }: LidoCtorParams,
  ) {
    this.programId = stateAccountInfo.owner;
    this.solidoAddr = stateAddr;
    this.withdrawStakeToken = stSolAddr;

    this.solido = null;

    [this.stakeAuthorityAddress] = PublicKey.findProgramAddressSync(
      [this.solidoAddr.toBuffer(), Buffer.from("stake_authority")],
      this.programId,
    );
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
    const validator = this.solido.validators.entries.find((v) =>
      this.findStakeAccountAddressStake(v).equals(stakeSplitFrom),
    );
    if (!validator) {
      throw new ValidatorNotFoundError();
    }
    const voter = validator.pubkey;
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
    ]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode(
      {
        instruction: 2,
        amount: new BN(tokenAmount.toString()),
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
    const validatorPubkeyAndEntry = this.getHeaviestValidatorStakeAccount();
    const {
      entry: { stake_accounts_balance },
      pubkey: voter,
    } = validatorPubkeyAndEntry;
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
    const stakeSplitFrom = this.findStakeAccountAddressStake(
      validatorPubkeyAndEntry,
    );
    return {
      result: {
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
    return [this.solidoAddr];
  }

  update(accountInfoMap: AccountInfoMap): void {
    const state = accountInfoMap.get(this.solidoAddr.toString());
    if (state) {
      this.solido = getSolido(state.data);
    }
  }

  /**
   * The one exported by @chorusone/solido.js looks at the actual lamports
   * of the stake accounts. Using the data in this.solido should suffice
   *
   * Assumes this.solido already fetched
   */
  private getHeaviestValidatorStakeAccount(): ValidatorPubkeyAndEntry {
    const {
      validators: { entries },
    } = this.solido!;
    // edge-case: 0 validators?
    let heaviest = entries[0];
    for (let i = 1; i < entries.length; i++) {
      const curr = entries[i];
      if (
        effectiveStakeBalance(curr.entry).gt(
          effectiveStakeBalance(heaviest.entry),
        )
      ) {
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
    entry: {
      stake_seeds: { begin },
    },
    pubkey,
  }: ValidatorPubkeyAndEntry): PublicKey {
    return PublicKey.findProgramAddressSync(
      [
        this.solidoAddr.toBuffer(),
        pubkey.toBuffer(),
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
}: ValidatorEntry): BN {
  return stake_accounts_balance.sub(unstake_accounts_balance);
}

/**
 * See https://github.com/ChorusOne/solido/blob/7d74b094c6a96486257e14d3c89e011c5d00fce6/program/src/state.rs#L165
 * @param param0
 * @param amountStLamports
 * @returns
 */
function exchangeStSol(
  { st_sol_supply, sol_balance }: ExchangeRate,
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
