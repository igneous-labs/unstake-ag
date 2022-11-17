/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { getAccount } from "@solana/spl-token-v2";
import { AccountInfo, PublicKey } from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import { expect } from "chai";

import {
  ExchangeReturn,
  FeeAccounts,
  outLamports,
  outLamportsXSol,
  prepareCleanupTx,
  prepareSetupTx,
  prepareUnstakeTx,
  routeMarketLabels,
  routeMarketLabelsXSol,
  UnstakeAg,
  UnstakeRoute,
  UnstakeXSolRoute,
} from "@/unstake-ag";

const SERIALIZE_CONFIG_MOCK_SIG = {
  requireAllSignatures: false,
  verifyAllSignatures: false,
};

async function trySimulateExchangeReturnFirstTx(
  unstake: UnstakeAg,
  exchangeReturn: ExchangeReturn,
  user: PublicKey,
  routeLabel: string,
) {
  const { blockhash } = await unstake.connection.getLatestBlockhash();
  const setupTransaction = prepareSetupTx(exchangeReturn, blockhash, user);
  const unstakeTransaction = prepareUnstakeTx(exchangeReturn, blockhash, user);
  const cleanupTransaction = prepareCleanupTx(exchangeReturn, blockhash, user);
  console.log(
    routeLabel,
    "setup:",
    setupTransaction?.serialize(SERIALIZE_CONFIG_MOCK_SIG).length,
    "unstake:",
    unstakeTransaction.serialize(SERIALIZE_CONFIG_MOCK_SIG).length,
    "cleanup:",
    cleanupTransaction?.serialize(SERIALIZE_CONFIG_MOCK_SIG).length,
  );
  // try simulating setupTransaction or unstakeTransaction to
  // make sure they work
  const txToSim = setupTransaction || unstakeTransaction;
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
          user,
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
      const routeLabel = routeMarketLabelsXSol(route).join(" + ");
      try {
        const exchangeReturn = await unstake.exchangeXSol({
          route,
          srcTokenAccount: xSolTokenAcc,
          user,
          feeAccounts,
        });
        await trySimulateExchangeReturnFirstTx(
          unstake,
          exchangeReturn,
          user,
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