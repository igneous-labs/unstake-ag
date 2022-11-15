import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { Amm } from "@jup-ag/core";
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
export const UNUSABLE_JUP_MARKETS_LABELS: Set<Amm["label"]> = new Set([
  // 1300+ with spl
  "Serum",
  // 1300+ with spl
  "Raydium",
  // 1256 with marinade
  "GooseFX",
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
