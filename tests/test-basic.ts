import { Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";

import { outLamports, routeMarketLabels, UnstakeAg } from "@/unstake-ag";

describe("test basic functionality", () => {
  it("load and route", async () => {
    const testStakeAccPubkey = new PublicKey(
      "8rmCcsqJcLxdvJmaP9vqtM74vppRSCzr8kg7jsxFHPHT",
    );
    const conn = new Connection("https://solana-api.projectserum.com");
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
    const [{ epoch: currentEpoch }, { blockhash }] = await Promise.all([
      conn.getEpochInfo(),
      conn.getLatestBlockhash(),
    ]);
    const serializeConfig = {
      requireAllSignatures: false,
      verifyAllSignatures: false,
    };
    await Promise.all(
      routes.map(async (route) => {
        try {
          const { setupTransaction, unstakeTransaction, cleanupTransaction } =
            await unstake.exchange({
              route,
              stakeAccount,
              stakeAccountPubkey: testStakeAccPubkey,
              withdrawerAuth: user,
              stakerAuth: user,
              user,
              currentEpoch,
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
            routeMarketLabels(route).join(" + "),
            "setup:",
            setupTransaction?.serialize(serializeConfig).length,
            "unstake:",
            unstakeTransaction.serialize(serializeConfig).length,
            "cleanup:",
            cleanupTransaction?.serialize(serializeConfig).length,
          );
        } catch (e) {
          console.log(routeMarketLabels(route).join(" + "), "ERROR:", e);
        }
      }),
    );
  });
});
