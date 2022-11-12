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

// NB: this stake account needs to exist on mainnet for the test to work
const TEST_STAKE_ACC_PUBKEY = new PublicKey(
  "38V7xqBsHxANQTGfUNLyy7XUiZifdp9krWEggcrD99He",
);

// NB: this token acc needs to exist on mainnet for test to work
// This should be the orca sol-usdc pool's wsol reserves
const TEST_WSOL_ACC_PUBKEY = new PublicKey(
  "ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg",
);

const CONN = new Connection("https://try-rpc.mainnet.solana.blockdaemon.tech", {
  wsEndpoint: "wss://try-rpc.mainnet.solana.blockdaemon.tech:8443/websocket",
});

const SERIALIZE_CONFIG_MOCK_SIG = {
  requireAllSignatures: false,
  verifyAllSignatures: false,
};

// TODO: investigate
// `panicked at 'called `Option::unwrap()` on a `None` value', /home/ubuntu/projects/gfx-ssl/gfx-solana-common/src/safe_math.rs:241:37`
// in jup
const SHOULD_IGNORE_ROUTE_ERRORS = true;

// just load accounts once and use same accounts cache
// for all tests
const ROUTE_CACHE_DURATION_MS = 30_000;

// transient errors that can be ignored:
// - jup program 0x1771: slippage tolerance exceeded
// - jup program 0x1786: slippage tolerance exceeded for orca whirlpools
// - BlockhashNotFound: rpc desynced

describe("test basic functionality", () => {
  let unstake: UnstakeAg;
  let stakeAccount: AccountInfo<StakeAccount>;

  before(async () => {
    unstake = await UnstakeAg.load({
      cluster: "mainnet-beta",
      connection: CONN,
      routeCacheDuration: ROUTE_CACHE_DURATION_MS,
    });
    stakeAccount = await getStakeAccount(CONN, TEST_STAKE_ACC_PUBKEY);
  });

  it("full unstake", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippageBps: 10, // 10 BPS === 0.1%
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutes(unstake, stakeAccount, routes);
  });

  it("partial unstake", async () => {
    const lamportsLessThanMarinadeMin = 1_000_000_000;
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(lamportsLessThanMarinadeMin),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
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
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    expect(routes.length).to.eq(0);
  });

  it("full unstake with jup fees", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippageBps: 10,
      jupFeeBps: 3,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutes(unstake, stakeAccount, routes, TEST_WSOL_ACC_PUBKEY);
  });
});

async function checkRoutes(
  unstake: UnstakeAg,
  stakeAccount: AccountInfo<StakeAccount>,
  routes: UnstakeRoute[],
  jupFeeAccount?: PublicKey,
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
      const { setupTransaction, unstakeTransaction, cleanupTransaction } =
        await unstake.exchange({
          route,
          stakeAccount,
          stakeAccountPubkey: TEST_STAKE_ACC_PUBKEY,
          user,
          jupFeeAccount,
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
      // try simulating setupTransaction or unstakeTransaction to
      // make sure they work
      const txToSim = setupTransaction || unstakeTransaction;
      const sim = await CONN.simulateTransaction(txToSim, undefined);
      expect(
        sim.value.err,
        `Failed to simulate ${routeLabel}\nError: ${JSON.stringify(
          sim.value.err,
        )}\nLogs:\n${sim.value.logs?.join("\n")}`,
      ).to.be.null;
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
