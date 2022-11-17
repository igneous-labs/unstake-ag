import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  Connection,
  PublicKey,
  StakeProgram,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { Amm } from "@jup-ag/core";
import {
  StakeAccount,
  stakeAccountState,
  StakeState,
} from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import BN from "bn.js";
import JSBI from "jsbi";

import { PubkeyFromSeed } from "@/unstake-ag/common";
import {
  UnstakeRoute,
  UnstakeXSolRoute,
  UnstakeXSolRouteJupDirect,
} from "@/unstake-ag/route";
import type { ExchangeReturn, HybridPool } from "@/unstake-ag/unstakeAg/types";
import type { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

// Copied from jup core.cjs.development.js
function chunks<T>(array: Array<T>, size: number) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size),
  );
}

// Copied from jup core.cjs.development.js
export async function chunkedGetMultipleAccountInfos(
  connection: Connection,
  pks: string[],
  batchChunkSize: number = 1000,
  maxAccountsChunkSize: number = 100,
): Promise<Array<AccountInfo<Buffer> | null>> {
  return (
    await Promise.all(
      chunks(pks, batchChunkSize).map(async (batchPubkeys) => {
        const batch = chunks(batchPubkeys, maxAccountsChunkSize).map(
          (pubkeys) => ({
            methodName: "getMultipleAccounts",
            // eslint-disable-next-line no-underscore-dangle
            args: connection._buildArgs(
              [pubkeys],
              connection.commitment,
              "base64",
            ),
          }),
        );
        return (
          // getMultipleAccounts is quite slow, so we use fetch directly
          // eslint-disable-next-line no-underscore-dangle
          connection
            // @ts-ignore
            ._rpcBatchRequest(batch)
            // @ts-ignore
            .then((batchResults) => {
              const accounts = batchResults.reduce(
                // @ts-ignore
                (acc: Array<AccountInfo<Buffer> | null>, res) => {
                  // @ts-ignore
                  res.result.value.forEach((item) => {
                    if (item) {
                      const value = item;
                      value.data = Buffer.from(item.data[0], item.data[1]);
                      value.owner = new PublicKey(item.owner);
                      acc.push(value);
                    } else {
                      acc.push(null);
                    }
                  });
                  return acc;
                },
                [],
              );
              return accounts;
            })
            .catch(() => batchPubkeys.map(() => null))
        );
      }),
    )
  ).flat();
}

export function dummyAccountInfoForProgramOwner(
  programOwner: PublicKey,
): AccountInfo<Buffer> {
  return {
    executable: false,
    owner: programOwner,
    lamports: 0,
    data: Buffer.from(""),
  };
}

// TODO: export from solana-stake-sdk
export const STAKE_STATE_LEN = 200;

export const U64_MAX = new BN("18446744073709551615");

interface DummyStakeAccountParams {
  currentEpoch: BN;
  lamports: number;
  stakeState: StakeState;
  voter: PublicKey;
}

/**
 * Assumes no lockup.
 * authorized is set to { staker: PublicKey.default, withdrawer: PublicKey.default }
 * creditsObserved is set to 0
 * warmupCooldownRate is set to 0
 * stake is null if inactive
 * activation/deactivation epoch is either 0, currentEpoch, or U64_MAX depending on state
 *
 * Alternative is a `splitStakeAccount()` function that copies
 * everything but auths from an AccountInfo<StakeAccount> but
 * that would mean having to fetch stake account data from onchain
 *
 * TODO: back to the drawing board if anything starts using creditsObserved or warmupCooldownRate
 * TODO: activationEpoch set to 0 for active case means in cases where
 * active stake acc is new, deposit to marinade will fail
 *
 * @returns
 */
export function dummyStakeAccountInfo({
  currentEpoch,
  lamports,
  stakeState,
  voter,
}: DummyStakeAccountParams): AccountInfo<StakeAccount> {
  const data: StakeAccount = {
    type: "initialized" as const,
    info: {
      meta: {
        rentExemptReserve: STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS,
        authorized: {
          staker: PublicKey.default,
          withdrawer: PublicKey.default,
        },
        lockup: {
          unixTimestamp: 0,
          epoch: 0,
          custodian: SystemProgram.programId,
        },
      },
      stake: null,
    },
  };
  if (stakeState !== "inactive") {
    data.type = "delegated";
    const stake = new BN(lamports).sub(STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS);
    let activationEpoch;
    let deactivationEpoch;
    switch (stakeState) {
      case "activating":
        activationEpoch = currentEpoch;
        deactivationEpoch = U64_MAX;
        break;
      case "active":
        activationEpoch = new BN(0);
        deactivationEpoch = U64_MAX;
        break;
      case "deactivating":
        activationEpoch = new BN(0);
        deactivationEpoch = currentEpoch;
        break;
      default:
        throw new Error("unreachable");
    }
    data.info.stake = {
      creditsObserved: 0,
      delegation: {
        warmupCooldownRate: 0,
        stake,
        voter,
        activationEpoch,
        deactivationEpoch,
      },
    };
  }
  return {
    executable: false,
    owner: StakeProgram.programId,
    lamports,
    data,
  };
}

/**
 * Markets that we can't use because they use too many accounts
 * resulting in tx too large, or they dont list any xSOL-SOL pairs
 *
 * TODO: add more as they come up
 */
export const UNUSABLE_JUP_MARKETS_LABELS: Set<Amm["label"]> = new Set([
  // 1300+ with spl
  "Serum",
  // 1300+ with spl
  "Raydium",
  // 1256 with marinade
  "GooseFX",

  // Markets below dont have any xSOL-SOL pairs listed.
  // Comment them out to discover new markets + listings
  // EDIT: any DEX with SOL pairs is good for XSolJupDirect routes
  /*
  "Cropper",
  "Cykura",
  "DeltaFi",
  "Invariant",
  "Lifinity",
  "Lifinity V2",
  "Meteora",
  "Step",
  "Penguin",
  "Stepn",
  "Sencha",
  "Saber (Decimals)",
  "Unknown",
  */
]);

// Not used for now, implementing this functionality using jup's ammsToExclude functionality
/**
 * Markets we can use (known so-far, check by seeing if
 * `Error: Transaction too large` is thrown in test-basic):
 * - Orca
 * - Saber
 *
 * @param routes
 * @returns
 */
/*
export function filterNotSupportedJupRoutes(routes: RouteInfo[]): RouteInfo[] {
  return routes.filter((route) => {
    const marketsInvolved = route.marketInfos
      .map((m) => m.amm.label.split("+").map((str) => str.trim()))
      .flat();
    for (let i = 0; i < marketsInvolved.length; i++) {
      const market = marketsInvolved[i];
      if (UNUSABLE_JUP_MARKETS_LABELS.has(market as Amm['label'])) {
        return false;
      }
    }
    return true;
  });
}
*/

export function routeMarketLabels(route: UnstakeRoute): string[] {
  const res = [route.stakeAccInput.stakePool.label];
  if (route.jup) {
    res.push(...route.jup.marketInfos.map((m) => m.amm.label));
  }
  return res;
}

export function routeMarketLabelsXSol(route: UnstakeXSolRoute): string[] {
  if (isXSolRouteJupDirect(route)) {
    return route.jup.marketInfos.map((m) => m.amm.label);
  }
  return [
    route.withdrawStake.withdrawStakePool.label,
    ...routeMarketLabels(route.unstake),
  ];
}

/**
 * Checks if accounts owned by the token program exists.
 * Does not differentiate between mint and tokenAccount accounts.
 * Returns false if account exists but not owned by token program
 *
 * @param connection
 * @param tokenAccs
 * @returns
 */
export async function doTokenProgramAccsExist(
  connection: Connection,
  tokenAccs: PublicKey[],
): Promise<boolean[]> {
  const result = await chunkedGetMultipleAccountInfos(
    connection,
    tokenAccs.map((pk) => pk.toString()),
  );
  return result.map((optAccount) => {
    if (optAccount === null) {
      return false;
    }
    if (!optAccount.owner.equals(TOKEN_PROGRAM_ID)) {
      return false;
    }
    return true;
  });
}

export async function genShortestUnusedSeed(
  connection: Connection,
  basePubkey: PublicKey,
  programId: PublicKey,
): Promise<PubkeyFromSeed> {
  const MAX_SEED_LEN = 32;
  const ASCII_MAX = 127;
  let len = 1;
  // find the smallest available seed to optimize for small tx size
  while (len <= MAX_SEED_LEN) {
    const codes = new Array(len).fill(0);
    while (!codes.every((c) => c === ASCII_MAX)) {
      // check current seed unused
      const seed = String.fromCharCode(...codes);
      // eslint-disable-next-line no-await-in-loop
      const derived = await PublicKey.createWithSeed(
        basePubkey,
        seed,
        programId,
      );
      // eslint-disable-next-line no-await-in-loop
      const balance = await connection.getBalance(derived);
      if (balance === 0) {
        return {
          base: basePubkey,
          derived,
          seed,
        };
      }
      // current seed used, increment code
      codes[codes.length - 1]++;
      for (let i = codes.length - 1; i > 0; i--) {
        const prevI = i - 1;
        if (codes[i] > ASCII_MAX) {
          codes[i] = 0;
          codes[prevI]++;
        }
      }
    }
    // all seeds of current len are used
    len++;
  }
  throw new Error("No unused seeds found");
}

export function calcStakeUnstakedAmount(
  lamportsToUnstake: bigint,
  stakeAccount: AccountInfo<StakeAccount>,
  currentEpoch: number,
): {
  stakeAmount: JSBI;
  unstakedAmount: JSBI;
} {
  const state = stakeAccountState(stakeAccount.data, new BN(currentEpoch));
  if (state === "inactive" || state === "activating") {
    return {
      stakeAmount: JSBI.BigInt(0),
      unstakedAmount: JSBI.BigInt(lamportsToUnstake.toString()),
    };
  }
  // partial unstake
  if (lamportsToUnstake < BigInt(stakeAccount.lamports)) {
    const rentExempt = JSBI.BigInt(
      STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toString(),
    );
    return {
      stakeAmount: JSBI.subtract(
        JSBI.BigInt(lamportsToUnstake.toString()),
        rentExempt,
      ),
      unstakedAmount: rentExempt,
    };
  }
  // full unstake
  const stakeAmount = JSBI.BigInt(
    stakeAccount.data.info.stake!.delegation.stake.toString(),
  );
  const unstakedAmount = JSBI.subtract(
    JSBI.BigInt(stakeAccount.lamports),
    stakeAmount,
  );
  return {
    stakeAmount,
    unstakedAmount,
  };
}

/**
 * TODO: this should be exported from @soceanfi/solana-stake-sdk
 */
export function isLockupInForce(
  stakeAcc: StakeAccount,
  currentEpoch: number,
): boolean {
  const { unixTimestamp, epoch } = stakeAcc.info.meta.lockup;
  // Assumes local time is a good approx of on-chain unix time
  return unixTimestamp > Date.now() / 1_000 || epoch > currentEpoch;
}

/**
 * Deduplicate public keys
 * TODO: PublicKey -> string -> PublicKey conversion is probably slow,
 * see if theres a better way
 * @param arr
 * @returns
 */
export function dedupPubkeys(arr: PublicKey[]): string[] {
  return [...new Set(arr.map((pk) => pk.toString()))];
}

/**
 * Additional signatures required are accounted for,
 * i.e. actual tx size is `tx.serialize().length`
 * and not `tx.serialize().length + 64 * additional required signatures`
 * @param feePayer
 * @param firstTx
 * @param secondTx
 * @returns a new transaction with the 2 transaction's instructions merged if possible, null otherwise
 */
export function tryMerge2Txs(
  feePayer: PublicKey,
  firstTx: Transaction,
  secondTx: Transaction,
): Transaction | null {
  const MOCK_BLOCKHASH = "41xkyTsFaxnPvjv3eJMdjGfmQj3osuTLmqC3P13stSw3";
  const SERIALIZE_CONFIG = {
    requireAllSignatures: false,
    verifyAllSignatures: false,
  };
  const merged = new Transaction();
  merged.add(...firstTx.instructions);
  merged.add(...secondTx.instructions);
  merged.feePayer = feePayer;
  merged.recentBlockhash = MOCK_BLOCKHASH;
  try {
    merged.serialize(SERIALIZE_CONFIG);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg && msg.includes("Transaction too large")) {
      return null;
    }
    // uncaught
    throw e;
  }
  merged.feePayer = undefined;
  merged.recentBlockhash = undefined;
  return merged;
}

/**
 *
 * @param param0
 * @returns expected amount of lamports to be received for the given unstake route,
 *          excluding slippage.
 */
export function outLamports({ stakeAccInput, jup }: UnstakeRoute): bigint {
  if (!jup) {
    return stakeAccInput.outAmount;
  }
  return BigInt(jup.outAmount.toString());
}

export function tryMergeExchangeReturn(
  user: PublicKey,
  { setupTransaction, unstakeTransaction, cleanupTransaction }: ExchangeReturn,
): ExchangeReturn {
  let newSetupTransaction = setupTransaction;
  let newUnstakeTransaction = unstakeTransaction;
  let newCleanupTransaction = cleanupTransaction;

  if (setupTransaction) {
    const mergeSetup = tryMerge2Txs(
      user,
      setupTransaction.tx,
      unstakeTransaction.tx,
    );
    if (mergeSetup) {
      newSetupTransaction = undefined;
      newUnstakeTransaction = {
        tx: mergeSetup,
        signers: [...setupTransaction.signers, ...unstakeTransaction.signers],
      };
    }
  }

  if (cleanupTransaction) {
    const mergeCleanup = tryMerge2Txs(
      user,
      newUnstakeTransaction.tx,
      cleanupTransaction.tx,
    );
    if (mergeCleanup) {
      newCleanupTransaction = undefined;
      newUnstakeTransaction = {
        tx: mergeCleanup,
        signers: [
          ...newUnstakeTransaction.signers,
          ...cleanupTransaction.signers,
        ],
      };
    }
  }
  return {
    setupTransaction: newSetupTransaction,
    unstakeTransaction: newUnstakeTransaction,
    cleanupTransaction: newCleanupTransaction,
  };
}

export function isHybridPool(pool: WithdrawStakePool): pool is HybridPool {
  return "canAcceptStakeAccount" in pool;
}

export function isXSolRouteJupDirect(
  route: UnstakeXSolRoute,
): route is UnstakeXSolRouteJupDirect {
  return "jup" in route;
}

export function outLamportsXSol(route: UnstakeXSolRoute): bigint {
  if (isXSolRouteJupDirect(route)) {
    return BigInt(route.jup.outAmount.toString());
  }
  return outLamports(route.unstake);
}

export function prepareSetupTx(
  exchangeReturn: ExchangeReturn,
  recentBlockhash: string,
  feePayer: PublicKey,
): Transaction | undefined {
  return prepareTxInternal(
    exchangeReturn,
    recentBlockhash,
    feePayer,
    "setupTransaction",
  );
}

export function prepareUnstakeTx(
  exchangeReturn: ExchangeReturn,
  recentBlockhash: string,
  feePayer: PublicKey,
): Transaction {
  return prepareTxInternal(
    exchangeReturn,
    recentBlockhash,
    feePayer,
    "unstakeTransaction",
  )!;
}

export function prepareCleanupTx(
  exchangeReturn: ExchangeReturn,
  recentBlockhash: string,
  feePayer: PublicKey,
): Transaction | undefined {
  return prepareTxInternal(
    exchangeReturn,
    recentBlockhash,
    feePayer,
    "cleanupTransaction",
  );
}

/**
 * Sets `recentBlockhash` and `feePayer` and partialSigns
 * with additionalSigners for the given transaction in an
 * `ExchangeReturn`
 *
 * Modifies in-place
 *
 * @param exchangeReturn
 * @param recentBlockhash
 * @param feePayer
 * @param whichTx
 */
function prepareTxInternal(
  exchangeReturn: ExchangeReturn,
  recentBlockhash: string,
  feePayer: PublicKey,
  whichTx: "setupTransaction" | "unstakeTransaction" | "cleanupTransaction",
): Transaction | undefined {
  const txWithSigners = exchangeReturn[whichTx];
  if (txWithSigners === undefined) {
    return txWithSigners;
  }
  txWithSigners.tx.recentBlockhash = recentBlockhash;
  txWithSigners.tx.feePayer = feePayer;
  // NOTE: @solana/web3.js throws empty signers error without this check
  if (txWithSigners.signers.length > 0) {
    txWithSigners.tx.partialSign(...txWithSigners.signers);
  }
  return txWithSigners.tx;
}
