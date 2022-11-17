/**
 * Dumps the addresses (including some PDAs) for all StakePools, WithdrawStakePools, HybridPools and
 * some other commonly used accounts to a line-separated file for use in creating
 * transaction lookup tables
 */

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  StakeProgram,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_EPOCH_SCHEDULE_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_REWARDS_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SYSVAR_SLOT_HISTORY_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
} from "@solana/web3.js";
import { closeSync, openSync, writeFileSync } from "fs";

import {
  dedupPubkeys,
  LidoWithdrawStakePool,
  MarinadeStakePool,
  SplStakePool,
  UnstakeAg,
  UnstakeIt,
} from "@/unstake-ag";

const OUTPUT_FILE = "addrs.txt";
const CLUSTER = "mainnet-beta";

const COMMON_ACCOUNTS = [
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_STAKE_HISTORY_PUBKEY,
  SYSVAR_EPOCH_SCHEDULE_PUBKEY,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
  SYSVAR_REWARDS_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SYSVAR_SLOT_HISTORY_PUBKEY,
  SystemProgram.programId,
  ComputeBudgetProgram.programId,
  StakeProgram.programId,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
];

function main() {
  let fd: number | undefined;
  try {
    const stakePoolPubkeys = UnstakeAg.createStakePools(CLUSTER).flatMap(
      (sp) => {
        if (sp instanceof UnstakeIt) {
          return [
            sp.feeAddr,
            sp.outputToken,
            sp.poolAddr,
            sp.poolSolReservesAddr,
            sp.program.programId,
            sp.protocolFeeAddr,
          ];
        }
        if (sp instanceof MarinadeStakePool) {
          return [
            sp.mSolMintAuthority,
            sp.outputToken,
            sp.program.programAddress,
            sp.stakeDepositAuthority,
            sp.stakeWithdrawAuthority,
            sp.stateAddr,
            sp.validatorRecordsAddr,
          ];
        }
        throw new Error("unreachable");
      },
    );
    const withdrawStakePoolPubkeys = UnstakeAg.createWithdrawStakePools(
      CLUSTER,
    ).flatMap((wsp) => {
      if (wsp instanceof LidoWithdrawStakePool) {
        return [
          wsp.programId,
          wsp.solidoAddr,
          wsp.stakeAuthorityAddress,
          wsp.withdrawStakeToken,
        ];
      }
      throw new Error("unreachable");
    });
    const hybridPoolPubkeys = UnstakeAg.createHybridPools(CLUSTER).flatMap(
      (hp) => {
        if (hp instanceof SplStakePool) {
          return [
            hp.outputToken,
            hp.programId,
            hp.stakePoolAddr,
            hp.validatorListAddr,
            hp.withdrawStakeToken,
          ];
        }
        throw new Error("unreachable");
      },
    );
    const allAccounts = dedupPubkeys([
      ...COMMON_ACCOUNTS,
      ...stakePoolPubkeys,
      ...withdrawStakePoolPubkeys,
      ...hybridPoolPubkeys,
    ]);
    console.log("# Accounts:", allAccounts.length);

    fd = openSync(OUTPUT_FILE, "w");

    for (let i = 0; i < allAccounts.length - 1; i++) {
      writeFileSync(fd, allAccounts[i]);
      writeFileSync(fd, "\n");
    }
    writeFileSync(fd, allAccounts[allAccounts.length - 1]);
  } catch (e) {
    console.error(e);
  } finally {
    if (fd) {
      closeSync(fd);
    }
  }
  console.log("Done");
}

main();
