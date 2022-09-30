import {
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token-v2";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { RouteInfo } from "@jup-ag/core";
import { StakeAccount, stakeAccountState } from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import BN from "bn.js";
import JSBI from "jsbi";
import { UnstakeRoute } from "route";

// Copied from jup core.cjs.development.js
export function chunks<T>(array: Array<T>, size: number) {
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

/**
 * Markets that we can't use because they use too many accounts
 * resulting in tx too large
 *
 * TODO: add more as they come up
 */
const UNUSABLE_JUP_MARKETS_LABELS: Set<string> = new Set(["Serum", "Raydium"]);

/**
 * Markets we can use (known so-far, check by seeing if
 * `Error: Transaction too large` is thrown in test-basic):
 * - Orca
 * - Saber
 *
 * @param routes
 * @returns
 */
export function filterSmallTxSizeJupRoutes(routes: RouteInfo[]): RouteInfo[] {
  const MAX_JUP_MARKETS = 1;
  return routes.filter((route) => {
    const marketsInvolved = route.marketInfos
      .map((m) => m.amm.label.split("+").map((str) => str.trim()))
      .flat();
    if (marketsInvolved.length > MAX_JUP_MARKETS) {
      return false;
    }
    for (let i = 0; i < marketsInvolved.length; i++) {
      const market = marketsInvolved[i];
      if (UNUSABLE_JUP_MARKETS_LABELS.has(market)) {
        return false;
      }
    }
    return true;
  });
}

export function routeMarketLabels(route: UnstakeRoute): string[] {
  const res = [route.stakeAccInput.stakePool.label];
  if (route.jup) {
    res.push(...route.jup.marketInfos.map((m) => m.amm.label));
  }
  return res;
}

export async function doesTokenAccExist(
  connection: Connection,
  tokenAcc: PublicKey,
): Promise<boolean> {
  try {
    await getAccount(connection, tokenAcc);
    return true;
  } catch (e) {
    if (
      e instanceof TokenAccountNotFoundError ||
      e instanceof TokenInvalidAccountOwnerError
    ) {
      return false;
    }
    throw e;
  }
}

export async function genShortestUnusedSeed(
  connection: Connection,
  basePubkey: PublicKey,
  programId: PublicKey,
): Promise<{ derived: PublicKey; seed: string }> {
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
