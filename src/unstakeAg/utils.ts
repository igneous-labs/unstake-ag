// Copied from jup core.cjs.development.js

import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { RouteInfo } from "@jup-ag/core";
import { UnstakeRoute } from "route";

export function chunks<T>(array: Array<T>, size: number) {
  return Array.apply(0, new Array(Math.ceil(array.length / size))).map(
    (_, index) => array.slice(index * size, (index + 1) * size),
  );
}

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
 * TODO: additional market filters
 *
 * Markets that we can't use because tx too large:
 * - Orca (WhirlPools)
 * - Serum
 * - Raydium
 *
 * Markets we can use:
 * - Orca
 * - Saber
 *
 * @param routes
 * @returns
 */
export function filterSmallTxSizeJupRoutes(routes: RouteInfo[]): RouteInfo[] {
  const MAX_JUP_MARKETS = 1;
  return routes.filter((route) => {
    const marketsInvolved = Math.max(
      route.marketInfos.length,
      route.marketInfos
        .map((m) => m.amm.label.split("+").length)
        .reduce((sum, curr) => sum + curr, 0),
    );
    return marketsInvolved <= MAX_JUP_MARKETS;
  });
}

export function routeMarketLabels(route: UnstakeRoute): string[] {
  const res = [route.stakeAccInput.stakePool.label];
  if (route.jup) {
    res.push(...route.jup.marketInfos.map((m) => m.amm.label));
  }
  return res;
}
