import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { WRAPPED_SOL_MINT } from "@jup-ag/core";
import { getStakeAccount, StakeAccount } from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import { expect } from "chai";
import JSBI from "jsbi";

import { checkRoutes } from "@/tests/utils";
import {
  EVERSOL_ADDRESS_MAP,
  LAINE_ADDRESS_MAP,
  outLamportsXSol,
  routeMarketLabelsXSol,
  SOCEAN_ADDRESS_MAP,
  UnstakeAg,
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

// NB: this token acc needs to exist on mainnet for test to work
// This should be the psyfi scnsol reserves
const TEST_SCNSOL_ACC_PUBKEY = new PublicKey(
  "E3MhxxGwazbendioKejk39R5Y5ne5tvB7uhongEaeCPt",
);

const REFERRAL_DESTINATIONS = {
  [WRAPPED_SOL_MINT.toString()]: TEST_WSOL_ACC_PUBKEY,
  [SOCEAN_ADDRESS_MAP["mainnet-beta"].stakePoolToken.toString()]:
    TEST_SCNSOL_ACC_PUBKEY,
};

const CONN = new Connection("https://try-rpc.mainnet.solana.blockdaemon.tech", {
  wsEndpoint: "wss://try-rpc.mainnet.solana.blockdaemon.tech:8443/websocket",
});

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
    await checkRoutes(unstake, stakeAccount, TEST_STAKE_ACC_PUBKEY, routes);
  });

  it("partial unstake", async () => {
    const lamportsLessThanMarinadeMin = 1_000_000_000;
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(lamportsLessThanMarinadeMin),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutes(unstake, stakeAccount, TEST_STAKE_ACC_PUBKEY, routes);
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

  it("full unstake with referral fees", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippageBps: 10,
      jupFeeBps: 3,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutes(
      unstake,
      stakeAccount,
      TEST_STAKE_ACC_PUBKEY,
      routes,
      REFERRAL_DESTINATIONS,
    );
  });

  it("scnSOL", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: SOCEAN_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
    });
    console.log(
      routes.map(
        (route) => `${routeMarketLabelsXSol(route)} ${outLamportsXSol(route)}`,
      ),
    );
  });

  it("laineSOL", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: LAINE_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
    });
    console.log(
      routes.map(
        (route) => `${routeMarketLabelsXSol(route)} ${outLamportsXSol(route)}`,
      ),
    );
  });

  it("everSOL", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: EVERSOL_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
    });
    console.log(
      routes.map(
        (route) => `${routeMarketLabelsXSol(route)} ${outLamportsXSol(route)}`,
      ),
    );
  });
});
