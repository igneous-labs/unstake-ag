// Copied from jup core.cjs.development.js

import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";

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
            .then((batchResults) => {
              // @ts-ignore
              const accounts = batchResults.reduce(
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
