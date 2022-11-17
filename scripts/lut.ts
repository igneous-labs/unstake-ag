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

import { dedupPubkeys } from "@/unstake-ag";

const OUTPUT_FILE = "addrs.txt";
// const CLUSTER = "mainnet-beta" as const;

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
    fd = openSync(OUTPUT_FILE, "w");
    const allAccounts = dedupPubkeys(COMMON_ACCOUNTS);
    console.log("# Accounts:", allAccounts.length);
    for (const account of allAccounts) {
      writeFileSync(fd, account);
      writeFileSync(fd, "\n");
    }
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
