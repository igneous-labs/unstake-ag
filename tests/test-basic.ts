/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";
import { expect } from "chai";

import { outLamports, routeMarketLabels, UnstakeAg } from "@/unstake-ag";

// transient errors that can be ignored:
// - jup program 0x1771: slippage tolerance exceeded
// - jup program 0x1786: some orca whirlpools error, not sure what this is, but is transient
// - BlockhashNotFound: rpc desynced

describe("test basic functionality", () => {
  it("load and route", async () => {
    // NOTE: this stake account needs to exist on mainnet for the test to work
    const testStakeAccPubkey = new PublicKey(
      "38V7xqBsHxANQTGfUNLyy7XUiZifdp9krWEggcrD99He",
    );
    const conn = new Connection(
      "https://try-rpc.mainnet.solana.blockdaemon.tech",
    );
    const unstake = await UnstakeAg.load({
      cluster: "mainnet-beta",
      connection: conn,
    });
    const stakeAccount = await getStakeAccount(conn, testStakeAccPubkey);
    const user = stakeAccount.data.info.meta.authorized.withdrawer;
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippagePct: 0.1,
    });
    console.log(routes);
    console.log(
      routes.map(
        (r) =>
          `${routeMarketLabels(r).join(" + ")}: ${outLamports(r).toString()}`,
      ),
    );
    console.log(routes.length);
    const { blockhash } = await conn.getLatestBlockhash();
    const serializeConfig = {
      requireAllSignatures: false,
      verifyAllSignatures: false,
    };
    const results = await Promise.allSettled(
      routes.map(async (route) => {
        const routeLabel = routeMarketLabels(route).join(" + ");
        const { setupTransaction, unstakeTransaction, cleanupTransaction } =
          await unstake.exchange({
            route,
            stakeAccount,
            stakeAccountPubkey: testStakeAccPubkey,
            user,
          });
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
          setupTransaction?.serialize(serializeConfig).length,
          "unstake:",
          unstakeTransaction.serialize(serializeConfig).length,
          "cleanup:",
          cleanupTransaction?.serialize(serializeConfig).length,
        );
        // try simulating transactions with no setupTransactions to
        // make sure they work
        if (!setupTransaction) {
          const sim = await conn.simulateTransaction(
            unstakeTransaction,
            undefined,
          );
          expect(
            sim.value.err,
            `Failed to simulate ${routeLabel}\nError: ${JSON.stringify(
              sim.value.err,
            )}\nLogs:\n${sim.value.logs?.join("\n")}`,
          ).to.be.null;
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
  });
});
