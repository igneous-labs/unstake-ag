import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { WRAPPED_SOL_MINT } from "@jup-ag/common";
import { getStakeAccount, StakeAccount } from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import { expect } from "chai";
import JSBI from "jsbi";

import { checkRoutes, checkRoutesXSol } from "@/tests/utils";
import {
  COGENT_ADDRESS_MAP,
  EVERSOL_ADDRESS_MAP,
  LAINE_ADDRESS_MAP,
  legacyTxAmmsToExclude,
  LIDO_ADDRESS_MAP,
  MARINADE_ADDRESS_MAP,
  MRGN_ADDRESS_MAP,
  RISK_LOL_ADDRESS_MAP,
  SOCEAN_ADDRESS_MAP,
  UnstakeAg,
} from "@/unstake-ag";

// NB: this stake account needs to exist on mainnet for the test to work
const TEST_STAKE_ACC_PUBKEY = new PublicKey(
  "54hApC96T53dsfTfs9EitEFotdY1ZedyumsF9WjZgpRx",
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

const CONN = new Connection("https://solana-mainnet.rpc.extrnode.com");

// TODO: investigate
// `panicked at 'called `Option::unwrap()` on a `None` value', /home/ubuntu/projects/gfx-ssl/gfx-solana-common/src/safe_math.rs:241:37`
// in jup
const SHOULD_IGNORE_ROUTE_ERRORS = true;

// just load accounts once and use same accounts cache
// for all tests
const ROUTE_CACHE_DURATION_MS = 120_000;

// transient errors that can be ignored:
// - jup program 0x1771: slippage tolerance exceeded
// - jup program 0x1786: slippage tolerance exceeded for orca whirlpools
// - BlockhashNotFound: rpc desynced
//
// Sometimes spl-stake-pools and lido will not show up in routes if they haven't been updated for the epoch

describe("test basic functionality", () => {
  let unstake: UnstakeAg;
  let stakeAccount: AccountInfo<StakeAccount>;

  before(async () => {
    unstake = await UnstakeAg.load({
      cluster: "mainnet-beta",
      connection: CONN,
      routeCacheDuration: ROUTE_CACHE_DURATION_MS,
      ammsToExclude: legacyTxAmmsToExclude(),
    });
    stakeAccount = await getStakeAccount(CONN, TEST_STAKE_ACC_PUBKEY);
  });

  it("full unstake", async () => {
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
      slippageBps: 10, // 10 BPS === 0.1%
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutes(
      unstake,
      stakeAccount,
      TEST_STAKE_ACC_PUBKEY,
      routes,
      undefined,
      true,
    );
  });

  it("full unstake v0", async () => {
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
      asLegacyTransaction: true,
    });
    await checkRoutes(
      unstake,
      stakeAccount,
      TEST_STAKE_ACC_PUBKEY,
      routes,
      undefined,
      true,
    );
    for (const route of routes) {
      expect(
        route.stakeAccInput.stakePool.label !== "Marinade",
        `Unexpected marinade: ${route}`,
      );
    }
  });

  it("partial unstake v0", async () => {
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
      asLegacyTransaction: true,
    });
    expect(routes.length).to.eq(0);
  });

  it("less than rent-exempt V0", async () => {
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
      asLegacyTransaction: true,
    });
    await checkRoutes(
      unstake,
      stakeAccount,
      TEST_STAKE_ACC_PUBKEY,
      routes,
      REFERRAL_DESTINATIONS,
      true,
    );
  });

  it("full unstake with referral fees v0", async () => {
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

  // SPL + unstake.it unstake tx = 929 bytes

  it("scnSOL", async () => {
    const TEST_SCN_SOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "8qxk2T8UmNpTZoxTiMMv4N6sKHh7VxTHdAF9SvHy34LJ",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: SOCEAN_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_SCN_SOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("scnSOL V0", async () => {
    const TEST_SCN_SOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "8qxk2T8UmNpTZoxTiMMv4N6sKHh7VxTHdAF9SvHy34LJ",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: SOCEAN_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_SCN_SOL_ACC_PUBKEY_HUMAN);
  });

  it("laineSOL", async () => {
    const TEST_LAINE_SOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "8u8nU44mWpFcUvSWAwFEScKeLWiaWrPJqeuRzUXbZ2bj",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: LAINE_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_LAINE_SOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("laineSOL V0", async () => {
    const TEST_LAINE_SOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "8u8nU44mWpFcUvSWAwFEScKeLWiaWrPJqeuRzUXbZ2bj",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: LAINE_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_LAINE_SOL_ACC_PUBKEY_HUMAN);
  });

  it("everSOL", async () => {
    const TEST_ESOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "393N3sSeiA6wCjdQmxgEvZC2REgwEKAjKpbjKrEtr36a",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: EVERSOL_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_ESOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("everSOL V0", async () => {
    const TEST_ESOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "393N3sSeiA6wCjdQmxgEvZC2REgwEKAjKpbjKrEtr36a",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: EVERSOL_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_ESOL_ACC_PUBKEY_HUMAN);
  });

  it("stSOL", async () => {
    const TEST_STSOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "4DX3z7QvnCeQGk6bsqCZALTnFRTvB4XXiZMktVBxVnog",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: LIDO_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_STSOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("stSOL V0", async () => {
    const TEST_STSOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "4DX3z7QvnCeQGk6bsqCZALTnFRTvB4XXiZMktVBxVnog",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: LIDO_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_STSOL_ACC_PUBKEY_HUMAN);
  });

  it("mSOL", async () => {
    // just jup since marinade doesnt implement WithdrawStakePool
    const TEST_MSOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "CrR7DS7A8ABSsHwx92K3b6bD1moBzn5SpWf2ske8bqML",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: MARINADE_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_MSOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("mSOL V0", async () => {
    // just jup since marinade doesnt implement WithdrawStakePool
    const TEST_MSOL_ACC_PUBKEY_HUMAN = new PublicKey(
      "CrR7DS7A8ABSsHwx92K3b6bD1moBzn5SpWf2ske8bqML",
    );
    const routes = await unstake.computeRoutesXSol({
      inputMint: MARINADE_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_MSOL_ACC_PUBKEY_HUMAN);
  });

  const TEST_COGENTSOL_ACC_PUBKEY_HUMAN = new PublicKey(
    "9agj67GxHNL5WQLiqSJfKmQaJgCRPKJGv6TmNvx1vYLF",
  );

  it("cogentSOL", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: COGENT_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_COGENTSOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("cogentSOL V0", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: COGENT_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(1_000_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_COGENTSOL_ACC_PUBKEY_HUMAN);
  });

  const TEST_RISKSOL_ACC_PUBKEY_HUMAN = new PublicKey(
    "4fkMhZe434N8tKZiRKqSHX3B23tPAWrK1t7eiaKARwY5",
  );

  it("riskSOL", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: RISK_LOL_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(30_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_RISKSOL_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("riskSOL V0", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: RISK_LOL_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(30_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_RISKSOL_ACC_PUBKEY_HUMAN);
  });

  const TEST_LST_ACC_PUBKEY_HUMAN = new PublicKey(
    "DgP4DLmDC3973LRVu9gA51XjfsP7NF4gvQBe5Uu9k6cr",
  );

  it("mrgn LST", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: MRGN_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(30_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
      asLegacyTransaction: true,
    });
    await checkRoutesXSol(
      unstake,
      routes,
      TEST_LST_ACC_PUBKEY_HUMAN,
      undefined,
      true,
    );
  });

  it("mrgn LST V0", async () => {
    const routes = await unstake.computeRoutesXSol({
      inputMint: MRGN_ADDRESS_MAP["mainnet-beta"].stakePoolToken,
      amount: JSBI.BigInt(30_000_000),
      slippageBps: 10,
      shouldIgnoreRouteErrors: SHOULD_IGNORE_ROUTE_ERRORS,
    });
    await checkRoutesXSol(unstake, routes, TEST_LST_ACC_PUBKEY_HUMAN);
  });
});
