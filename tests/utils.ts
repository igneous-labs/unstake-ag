/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { getAccount } from "@solana/spl-token-v2";
import {
  AccountInfo,
  Keypair,
  PublicKey,
  SimulateTransactionConfig,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import bs58 from "bs58";
import { expect } from "chai";

import {
  ExchangeReturn,
  ExchangeReturnV0,
  FeeAccounts,
  isXSolRouteJupDirect,
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

const SIMULATE_TRANSACTION_CONFIG: SimulateTransactionConfig = {
  // this makes it so that the simulation doesnt need the signer
  sigVerify: false,
  replaceRecentBlockhash: true,
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
    )}\nSimulation link: ${txToSimulationLink(txToVersionedTx(txToSim))}`,
  ).to.be.null;
}

async function trySimulateExchangeReturnV0FirstTx(
  unstake: UnstakeAg,
  exchangeReturn: ExchangeReturnV0,
  routeLabel: string,
) {
  console.log(
    routeLabel,
    "unstake:",
    exchangeReturn.unstakeTransaction.tx.serialize().length,
  );
  // try simulating unstakeTransaction to make sure it works
  const txToSim = exchangeReturn.unstakeTransaction.tx;
  // TODO: some new bullshit about tx sanitization
  // `Transaction failed to sanitize accounts offsets correctly: expected false to be true`
  // error that occurs sometimes, but when you open the simulation link in explorer it works fine
  const sim = await unstake.connection.simulateTransaction(
    txToSim,
    SIMULATE_TRANSACTION_CONFIG,
  );
  expect(
    sim.value.err,
    `Error: ${JSON.stringify(sim.value.err)}\nLogs:\n${sim.value.logs?.join(
      "\n",
    )}\nSimulation link: ${txToSimulationLink(txToSim)}`,
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
  asLegacyTransaction?: boolean,
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
          asLegacyTransaction,
        });
        if (asLegacyTransaction) {
          await trySimulateExchangeReturnFirstTx(
            unstake,
            exchangeReturn as ExchangeReturn,
            user,
            routeLabel,
          );
        } else {
          await trySimulateExchangeReturnV0FirstTx(
            unstake,
            exchangeReturn as ExchangeReturnV0,
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

export async function checkRoutesXSol(
  unstake: UnstakeAg,
  routes: UnstakeXSolRoute[],
  xSolTokenAcc: PublicKey,
  feeAccounts?: FeeAccounts,
  asLegacyTransaction?: boolean,
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
      const MAX_RANDOM_JITTER_MS = 3000;
      const routeLabel = routeMarketLabelsXSol(route).join(" + ");
      try {
        const exchangeReturn = await unstake.exchangeXSol({
          route,
          srcTokenAccount: xSolTokenAcc,
          user,
          feeAccounts,
          asLegacyTransaction,
        });
        await sleep(Math.random() * MAX_RANDOM_JITTER_MS);
        if (asLegacyTransaction) {
          await trySimulateExchangeReturnFirstTx(
            unstake,
            exchangeReturn as ExchangeReturn,
            user,
            routeLabel,
          );
        } else {
          await trySimulateExchangeReturnV0FirstTx(
            unstake,
            exchangeReturn as ExchangeReturnV0,
            routeLabel,
          );
        }
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
            asLegacyTransaction,
          });
          await sleep(Math.random() * MAX_RANDOM_JITTER_MS);
          if (asLegacyTransaction) {
            await trySimulateExchangeReturnFirstTx(
              unstake,
              exchangeReturnKp as ExchangeReturn,
              user,
              routeLabel,
            );
          } else {
            await trySimulateExchangeReturnV0FirstTx(
              unstake,
              exchangeReturnKp as ExchangeReturnV0,
              routeLabel,
            );
          }
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

export function txToSimulationLink(transaction: VersionedTransaction): string {
  const SIGNATURE_LENGTH = 64;
  const explorerUrl = new URL(`https://explorer.solana.com/tx/inspector`);
  const signatures = transaction.signatures.map((s) =>
    bs58.encode(s ?? Buffer.alloc(SIGNATURE_LENGTH)),
  );
  explorerUrl.searchParams.append("signatures", JSON.stringify(signatures));

  const { message } = transaction;
  explorerUrl.searchParams.append(
    "message",
    Buffer.from(message.serialize()).toString("base64"),
  );
  return explorerUrl.toString();
}

export function txToVersionedTx(tx: Transaction): VersionedTransaction {
  return new VersionedTransaction(tx.compileMessage());
}
