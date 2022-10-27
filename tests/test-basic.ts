/* eslint-disable @typescript-eslint/no-unused-expressions */
// allow `expect().to.be.true`

import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount, StakeAccount } from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import { expect } from "chai";

import {
  outLamports,
  routeMarketLabels,
  UnstakeAg,
  UnstakeRoute,
} from "@/unstake-ag";

// NOTE: this stake account needs to exist on mainnet for the test to work
const TEST_STAKE_ACC_PUBKEY = new PublicKey(
  "38V7xqBsHxANQTGfUNLyy7XUiZifdp9krWEggcrD99He",
);

const CONN = new Connection("https://try-rpc.mainnet.solana.blockdaemon.tech", {
  wsEndpoint: "wss://try-rpc.mainnet.solana.blockdaemon.tech:8443/websocket",
});

const SERIALIZE_CONFIG_MOCK_SIG = {
  requireAllSignatures: false,
  verifyAllSignatures: false,
};

// transient errors that can be ignored:
// - jup program 0x1771: slippage tolerance exceeded
// - jup program 0x1786: some orca whirlpools error, not sure what this is, but is transient
// - BlockhashNotFound: rpc desynced

describe("test basic functionality", () => {
  let unstake: UnstakeAg;
  let stakeAccount: AccountInfo<StakeAccount>;

  before(async () => {
    unstake = await UnstakeAg.load({
      cluster: "mainnet-beta",
      connection: CONN,
    });
    stakeAccount = await getStakeAccount(CONN, TEST_STAKE_ACC_PUBKEY);
  });

  it("full unstake", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippageBps: 10, // 10 BPS === 0.1%
      shouldIgnoreRouteErrors: false,
    });
    await checkRoutes(unstake, stakeAccount, routes);
  });

  it("partial unstake", async () => {
    const lamportsLessThanMarinadeMin = 1_000_000_000;
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(lamportsLessThanMarinadeMin),
      slippageBps: 10,
      shouldIgnoreRouteErrors: false,
    });
    await checkRoutes(unstake, stakeAccount, routes);
    for (const route of routes) {
      expect(
        route.stakeAccInput.stakePool.label !== "Marinade",
        `Unexpected marinade: ${route}`,
      );
    }
  });

  it("less than rent-exempt", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports:
        BigInt(STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toString()) - BigInt(1),
      slippageBps: 10,
      shouldIgnoreRouteErrors: false,
    });
    expect(routes.length).to.eq(0);
  });
});

async function checkRoutes(
  unstake: UnstakeAg,
  stakeAccount: AccountInfo<StakeAccount>,
  routes: UnstakeRoute[],
) {
  const user = stakeAccount.data.info.meta.authorized.withdrawer;
  // console.log(routes);
  console.log(
    routes.map(
      (r) =>
        `${routeMarketLabels(r).join(" + ")}: ${outLamports(r).toString()}`,
    ),
  );
  console.log(routes.length);
  const results = await Promise.allSettled(
    routes.map(async (route) => {
      const routeLabel = routeMarketLabels(route).join(" + ");
      const { setupTransaction, unstakeTransaction, cleanupTransaction } =
        await unstake.exchange({
          route,
          stakeAccount,
          stakeAccountPubkey: TEST_STAKE_ACC_PUBKEY,
          user,
        });
      const { blockhash } = await CONN.getLatestBlockhash();
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
      // try simulating transactions with no setupTransactions to
      // make sure they work
      if (!setupTransaction) {
        const sim = await CONN.simulateTransaction(
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
}
