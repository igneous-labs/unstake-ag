/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { getAccount } from "@solana/spl-token-v2";
import { AccountInfo, Keypair, PublicKey } from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import { expect } from "chai";

import {
  ExchangeReturnV0,
  FeeAccounts,
  isXSolRouteJupDirect,
  outLamports,
  outLamportsXSol,
  routeMarketLabels,
  routeMarketLabelsXSol,
  UnstakeAg,
  UnstakeRoute,
  UnstakeXSolRoute,
} from "@/unstake-ag";

async function trySimulateExchangeReturnFirstTx(
  unstake: UnstakeAg,
  { unstakeTransaction }: ExchangeReturnV0,
  routeLabel: string,
) {
  console.log(routeLabel, "unstake:", unstakeTransaction.serialize().length);
  // try simulating unstakeTransaction to make sure it works
  const txToSim = unstakeTransaction;
  const sim = await unstake.connection.simulateTransaction(txToSim, undefined);
  expect(
    sim.value.err,
    `Error: ${JSON.stringify(sim.value.err)}\nLogs:\n${sim.value.logs?.join(
      "\n",
    )}`,
  ).to.be.null;
}

function checkPromiseSettledArrayVerbose<T>(
  results: PromiseSettledResult<T>[],
) {
  expect(
    results.every((r) => r.status === "fulfilled"),
    `${results
      .map((r) => {
        if (r.status === "fulfilled") {
          return null;
        }
        return r.reason;
      })
      .filter((maybeReason) => Boolean(maybeReason))
      .join("\n\n")}`,
  ).to.be.true;
}

export async function checkRoutes(
  unstake: UnstakeAg,
  stakeAccount: AccountInfo<StakeAccount>,
  stakeAccountPubkey: PublicKey,
  routes: UnstakeRoute[],
  feeAccounts?: FeeAccounts,
) {
  const user = stakeAccount.data.info.meta.authorized.withdrawer;
  // console.log(routes);
  console.log(
    routes.map(
      (r) =>
        `${routeMarketLabels(r).join(" + ")}: ${outLamports(r).toString()}`,
    ),
  );
  console.log("# of routes:", routes.length);
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const routeLabel = routeMarketLabels(route).join(" + ");
      try {
        const exchangeReturn = await unstake.exchange({
          route,
          stakeAccount,
          stakeAccountPubkey,
          user,
          feeAccounts,
        });
        await trySimulateExchangeReturnFirstTx(
          unstake,
          exchangeReturn,
          routeLabel,
        );
      } catch (e) {
        const err = e as Error;
        err.message = `${routeLabel}: ${err.message}`;
        throw err;
      }
    }),
  );
  checkPromiseSettledArrayVerbose(results);
  // newline
  console.log();
}

export async function checkRoutesXSol(
  unstake: UnstakeAg,
  routes: UnstakeXSolRoute[],
  xSolTokenAcc: PublicKey,
  feeAccounts?: FeeAccounts,
) {
  const xSolTokenAccountInfo = await getAccount(
    unstake.connection,
    xSolTokenAcc,
  );
  const user = xSolTokenAccountInfo.owner;
  // console.log(routes);
  console.log(
    routes.map(
      (r) =>
        `${routeMarketLabelsXSol(r).join(" + ")}: ${outLamportsXSol(
          r,
        ).toString()}`,
    ),
  );
  console.log("# of routes:", routes.length);
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      // add some random jitter to avoid 429
      const MAX_RANDOM_JITTER_MS = 1000;
      const routeLabel = routeMarketLabelsXSol(route).join(" + ");
      try {
        const exchangeReturn = await unstake.exchangeXSol({
          route,
          srcTokenAccount: xSolTokenAcc,
          user,
          feeAccounts,
        });
        await sleep(Math.random() * MAX_RANDOM_JITTER_MS);
        await trySimulateExchangeReturnFirstTx(
          unstake,
          exchangeReturn,
          routeLabel,
        );
        // try with a generated keypair too if default is by seed, to make sure that works
        if (
          !isXSolRouteJupDirect(route) &&
          !route.withdrawStake.withdrawStakePool.mustUseKeypairForSplitStake
        ) {
          const exchangeReturnKp = await unstake.exchangeXSol({
            route,
            srcTokenAccount: xSolTokenAcc,
            user,
            feeAccounts,
            newStakeAccount: Keypair.generate(),
          });
          await sleep(Math.random() * MAX_RANDOM_JITTER_MS);
          await trySimulateExchangeReturnFirstTx(
            unstake,
            exchangeReturnKp,
            routeLabel,
          );
        }
      } catch (e) {
        const err = e as Error;
        err.message = `${routeLabel}: ${err.message}`;
        throw err;
      }
    }),
  );
  checkPromiseSettledArrayVerbose(results);
  // newline
  console.log();
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
