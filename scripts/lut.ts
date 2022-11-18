import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  PublicKey,
  sendAndConfirmTransaction,
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
  Transaction,
} from "@solana/web3.js";
// eslint-disable-next-line import/no-extraneous-dependencies
import { SolanaCliConfig } from "@soceanfi/solana-cli-config";

import {
  chunks,
  dedupPubkeys,
  LidoWithdrawStakePool,
  MarinadeStakePool,
  SplStakePool,
  UnstakeAg,
  UnstakeIt,
} from "@/unstake-ag";

// assumes authority == payer / no payer
// otherwise need to decrease by 1
const MAX_ACCOUNTS_PER_LUT_EXTEND = 30;

const CLUSTER = "mainnet-beta";
const CONFIG = SolanaCliConfig.load(process.env.SOLANA_CLI_CONFIG_PATH);
const RECENT_SLOT_PAST_BUFFER = 10;

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

async function main() {
  const stakePoolPubkeys = UnstakeAg.createStakePools(CLUSTER).flatMap((sp) => {
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
  });
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

  const conn = CONFIG.createConnection();
  const kp = CONFIG.loadKeypair();

  const { absoluteSlot } = await conn.getEpochInfo();
  const [createIx, lutPubkey] = AddressLookupTableProgram.createLookupTable({
    authority: kp.publicKey,
    payer: kp.publicKey,
    recentSlot: absoluteSlot - RECENT_SLOT_PAST_BUFFER,
  });
  console.log("LUT:", lutPubkey.toString());

  const createTx = new Transaction().add(createIx);
  const createTxSig = await sendAndConfirmTransaction(conn, createTx, [kp]);
  console.log("Create:", createTxSig);

  const pkChunks = chunks(allAccounts, MAX_ACCOUNTS_PER_LUT_EXTEND);
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < pkChunks.length; i++) {
    const c = pkChunks[i];
    const extendIx = AddressLookupTableProgram.extendLookupTable({
      lookupTable: lutPubkey,
      authority: kp.publicKey,
      payer: kp.publicKey,
      addresses: c.map((s) => new PublicKey(s)),
    });
    const extendTx = new Transaction().add(extendIx);
    const extendTxSig = await sendAndConfirmTransaction(conn, extendTx, [kp]);
    console.log(`Extend (${i + 1}/${pkChunks.length}):`, extendTxSig);
  }
  /* eslint-enable no-await-in-loop */
}

main();
