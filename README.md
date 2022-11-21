<div align="center">
  <a href="https://unstake.it/">
  <!-- need to use raw.githubusercontent.com URL for it to work with externally (vercel) hosted typedoc -->
  <img src="https://raw.githubusercontent.com/igneous-labs/unstake-ag/master/assets/logo.png" height="100" alt="unstake.it">
  </a>
</div>

<div align="center">

[![npm-version](https://img.shields.io/npm/v/@unstake-it/sol-ag?style=flat)](https://npmjs.com/@unstake-it/sol-ag)
[![npm-license](https://img.shields.io/npm/l/@unstake-it/sol-ag?style=flat)](https://npmjs.com/@unstake-it/sol-ag)
[![Twitter](https://img.shields.io/twitter/follow/unstakeit?style=flat&color=f24f83)](https://twitter.com/unstakeit)

</div>

# unstake.it Staked SOL Instant Unstake Aggregator Typescript SDK

[unstake.it](https://unstake.it) allows users to instantly unstake their Solana stake accounts to liquid SOL.

This SDK provides the core `UnstakeAg` class that aggregates the various unstake routes to compute the best route for a given stake account and unstake amount.

The SDK is heavily inspired by, and uses, [@jup-ag/core](https://www.npmjs.com/package/@jup-ag/core). The usage patterns are very similar.

Contents:
- [unstake.it Staked SOL Instant Unstake Aggregator Typescript SDK](#unstakeit-staked-sol-instant-unstake-aggregator-typescript-sdk)
  - [API](#api)
  - [Installation](#installation)
    - [npm](#npm)
    - [yarn](#yarn)
  - [Example](#example)
    - [Initialize](#initialize)
    - [Initialize with Reference to Shared Jupiter object](#initialize-with-reference-to-shared-jupiter-object)
    - [Compute Routes](#compute-routes)
    - [Create Transaction(s) from Routes](#create-transactions-from-route)
    - [Compute Routes for xSOL](#compute-routes-for-xsol)
    - [Create Transaction(s) from Route for xSOL](#create-transactions-from-route-for-xsol)
    - [Lookup Table](#lookup-table)
  - [Learn More](#learn-more)

## API

For easy dapp integration without having to install this SDK, we provide a ready-to-use API at https://api.unstake.it

API documentation is available at https://api.unstake.it

## Installation

### npm

```bash
$ npm install @unstake-it/sol-ag
```

### yarn

```bash
$ yarn add @unstake-it/sol-ag
```

## Example

### Initialize

```ts
import { Connection } from "@solana/web3.js";
import { UnstakeAg, legacyTxAmmsToExclude } from "@unstake-it/sol-ag";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// This loads the required accounts for all stake pools
// and jup-ag from on-chain.
// The arg type is `JupiterLoadParams` from jup-ag
const unstake = await UnstakeAg.load({
  cluster: "mainnet-beta",
  connection,
  // if you're using only legacy transactions (no lookup tables),
  // you should set ammsToExclude to legacyTxAmmsToExclude() to
  // avoid running into transaction size limits
  ammsToExclude: legacyTxAmmsToExclude(),
});
```

### Initialize with Reference to Shared Jupiter object

If you're already using the `@jup-ag/core` SDK elsewhere in your code, you can construct an `UnstakeAg` object that uses the same existing `Jupiter` object to avoid fetching and caching duplicate accounts.

```ts
import { Jupiter, JupiterLoadParams } from "@jup-ag/core";
import { UnstakeAg } from "@unstake-it/sol-ag";

const myJupParams: JupiterLoadParams = { ... };

const jupiter = await Jupiter.load(myJupParams);

const stakePools = UnstakeAg.createStakePools(myJupParams.cluster);
const withdrawStakePools = UnstakeAg.createWithdrawStakePools(myJupParams.cluster);
const hybridPools = UnstakeAg.createHybridPools(myJupParams.cluster);

const unstake = new UnstakeAg(myJupParams, stakePools, withdrawStakePools, hybridPools, jupiter);

// call unstake.updatePools()
// to perform an initial fetch of all stake pools' accounts
await unstake.updatePools();
```

### Compute Routes

```ts
import { PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";
import { outLamports } from "@unstake-it/sol-ag";

const stakeAccountPubkey = new PublicKey(...);
const stakeAccount = await getStakeAccount(connection, stakeAccountPubkey);
const routes = await unstake.computeRoutes({
  stakeAccount,
  amountLamports: BigInt(stakeAccount.lamports),
  slippageBps: 10,
  // you can optionally collect a fee on top
  // of any jup swaps, just as you can in jup sdk
  jupFeeBps: 3,
});
const bestRoute = routes[0];
const {
  stakeAccInput: {
    stakePool,
    inAmount,
    outAmount,
  },
  // optional jup-ag `RouteInfo` for any additional swaps
  // via jup required to convert stake pool tokens into SOL
  jup,
} = bestRoute;

console.log("Route will give me", outLamports(bestRoute), "lamports");
```

### Create Transaction(s) From Route

```ts
import { prepareSetupTx, prepareUnstakeTx, prepareCleanupTx } from "@unstake-it/sol-ag";

// returned transactions do not have `recentBlockhash` or `feePayer` set
// and are not signed
const exchangeReturn =
  await unstake.exchange({
    route: bestRoute,
    stakeAccount,
    stakeAccountPubkey,
    user: MY_WALLET_KEYPAIR.publicKey,
    // You can optionally provide a mapping of StakePool output tokens / wrapped SOL
    // to your token account of the same type to collect stake pool referral fees / jup swap fees
    feeAccounts: {
      "So11111111111111111111111111111111111111112": MY_WRAPPED_SOL_ACCOUNT,
      "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm": MY_SCNSOL_ACCOUNT,
    },
  });

const {
  setupTransaction,
  unstakeTransaction: { tx, signers },
  cleanupTransaction,
} = exchangeReturn;

const { blockhash, lastValidBlockHeight } = await unstake.connection.getLatestBlockhash();
const feePayer = MY_WALLET_KEYPAIR.publicKey;

const setupTx = prepareSetupTx(exchangeReturn, blockhash, feePayer);
if (setupTx) {
  setupTx.partialSign(MY_WALLET_KEYPAIR);
  const signature = await unstake.connection.sendRawTransaction(
    setupTx.serialize(),
  );
  await unstake.connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    }
  );
}

const unstakeTx = prepareUnstakeTx(exchangeReturn, blockhash, feePayer);
unstakeTx.partialSign(MY_WALLET_KEYPAIR);
const signature = await unstake.connection.sendRawTransaction(
  unstakeTx.serialize(),
);
await unstake.connection.confirmTransaction(
  {
    signature,
    blockhash,
    lastValidBlockHeight,
  }
);

const cleanupTx = prepareCleanupTx(exchangeReturn, blockhash, feePayer);
if (cleanupTx) {
  cleanupTx.partialSign(MY_WALLET_KEYPAIR);
  const signature = await unstake.connection.sendRawTransaction(
    cleanupTx.serialize(),
  );
  await unstake.connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    }
  );
}
```

### Compute Routes for xSOL

The aggregator also handles the unstaking of xSOL (supported liquid staking derivatives).

```ts
import { PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";
import JSBI from "jsbi";
import { isXSolRouteJupDirect, outLamportsXSol } from "@unstake-it/sol-ag"

const scnSOL = new PublicKey("5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm");
const routesScnSol = await unstake.computeRoutesXSol({
  inputMint: scnSOL,
  amount: JSBI.BigInt(1_000_000_000)
  slippageBps: 10,
  // args are the same as jups' computeRoutes(), except
  // - feeBps -> jupFeeBps
  // - +shouldIgnoreRouteErrors: boolean
  // - +stakePoolsToExclude: StakePoolsToExclude
});
const bestRouteScnSol = routesScnSol[0];
if (isXSolRouteJupDirect(bestRouteScnSol)) {
  const {
    jup, // jup RouteInfo type
  } = bestRouteScnSol;
} else {
  const {
    withdrawStake: {
      withdrawStakePool,
      inAmount,
      outAmount,
      stakeSplitFrom,
    },
    intermediateDummyStakeAccountInfo,
    unstake, // UnstakeRoute type
  } = bestRouteScnSol;
}

console.log("Route will give me", outLamportsXSol(bestRouteScnSol), "lamports");
```

### Create Transaction(s) From Route for xSOL

If required, stake pool stake withdraw instructions are placed in setupTransaction. This means that if the main unstakeTransaction fails, the user will be left with a stake account.

```ts
import { prepareSetupTx, prepareUnstakeTx, prepareCleanupTx } from "@unstake-it/sol-ag";

// returned transactions do not have `recentBlockhash` or `feePayer` set
// and are not signed
const exchangeReturn =
  await unstake.exchangeXSol({
    route: bestRouteScnSol,
    user: MY_WALLET_KEYPAIR.publicKey,
    srcTokenAccount: MY_SCNSOL_ACCOUNT,
    // You can optionally provide a mapping of StakePool output tokens / wrapped SOL
    // to your token account of the same type to collect stake pool referral fees / jup swap fees
    feeAccounts: {
      "So11111111111111111111111111111111111111112": MY_WRAPPED_SOL_ACCOUNT,
    },
  });

const {
  setupTransaction,
  unstakeTransaction: { tx, signers },
  cleanupTransaction,
} = exchangeReturn;

const { blockhash, lastValidBlockHeight } = await unstake.connection.getLatestBlockhash();
const feePayer = MY_WALLET_KEYPAIR.publicKey;

const setupTx = prepareSetupTx(exchangeReturn, blockhash, feePayer);
if (setupTx) {
  setupTx.partialSign(MY_WALLET_KEYPAIR);
  const signature = await unstake.connection.sendRawTransaction(
    setupTx.serialize(),
  );
  await unstake.connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    }
  );
}

const unstakeTx = prepareUnstakeTx(exchangeReturn, blockhash, feePayer);
unstakeTx.partialSign(MY_WALLET_KEYPAIR);
const signature = await unstake.connection.sendRawTransaction(
  unstakeTx.serialize(),
);
await unstake.connection.confirmTransaction(
  {
    signature,
    blockhash,
    lastValidBlockHeight,
  }
);

const cleanupTx = prepareCleanupTx(exchangeReturn, blockhash, feePayer);
if (cleanupTx) {
  cleanupTx.partialSign(MY_WALLET_KEYPAIR);
  const signature = await unstake.connection.sendRawTransaction(
    cleanupTx.serialize(),
  );
  await unstake.connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    }
  );
}
```

### Lookup Table

We provide a utility script for creating a lookup table that contains most of the included stake pools' relevant addresses and some commonly used programs and sysvars.

```sh
# verify that your solana cli config is correct
solana config get

yarn lut
```

A lookup table maintained by the team is available on mainnet-beta at `EhWxBHdmQ3yDmPzhJbKtGMM9oaZD42emt71kSieghy5`

## Learn More

- [SDK Typedoc](https://unstake-ag.vercel.app)
- [unstake.it](https://unstake.it)
