/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { AccountInfo, PublicKey } from "@solana/web3.js";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import { expect } from "chai";

import {
  FeeAccounts,
  outLamports,
  routeMarketLabels,
  UnstakeAg,
  UnstakeRoute,
} from "@/unstake-ag";

const SERIALIZE_CONFIG_MOCK_SIG = {
  requireAllSignatures: false,
  verifyAllSignatures: false,
};

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
        const { setupTransaction, unstakeTransaction, cleanupTransaction } =
          await unstake.exchange({
            route,
            stakeAccount,
            stakeAccountPubkey,
            user,
            feeAccounts,
          });
        const { blockhash } = await unstake.connection.getLatestBlockhash();
        if (setupTransaction) {
          setupTransaction.recentBlockhash = blockhash;
          setupTransaction.feePayer = user;
        }
        unstakeTransaction.recentBlockhash = blockhash;
        unstakeTransaction.feePayer = user;
        // console.log(unstakeTransaction.instructions.map(ix => `${ix.programId.toString()}: ${ix.keys.map(m => m.pubkey.toString())}`));
        if (cleanupTransaction) {
          cleanupTransaction.recentBlockhash = blockhash;
          cleanupTransaction.feePayer = user;
        }
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
        const sim = await unstake.connection.simulateTransaction(
          txToSim,
          undefined,
        );
        expect(
          sim.value.err,
          `Error: ${JSON.stringify(
            sim.value.err,
          )}\nLogs:\n${sim.value.logs?.join("\n")}`,
        ).to.be.null;
      } catch (e) {
        const err = e as Error;
        err.message = `${routeLabel}: ${err.message}`;
        throw err;
      }
    }),
  );
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
  // newline
  console.log();
}
