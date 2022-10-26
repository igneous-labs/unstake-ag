# <div align="center"><a href="https://unstake.it/"><img src="assets/logo.png" height="100" alt="unstake.it"></a></div>

# unstake.it Staked SOL Instant Unstake Aggregator Typescript SDK

[unstake.it](https://unstake.it) allows users to instantly unstake their Solana stake accounts to liquid SOL.

This SDK provides the core `UnstakeAg` class that aggregates the various unstake routes to compute the best route for a given stake account and unstake amount.

The SDK is heavily inspired by, and uses, [@jup-ag/core](https://www.npmjs.com/package/@jup-ag/core). The usage patterns are very similar.

Contents:
- [unstake.it Staked SOL Instant Unstake Aggregator Typescript SDK](#unstakeit-staked-sol-instant-unstake-aggregator-typescript-sdk)
  - [Installation](#installation)
    - [npm](#npm)
    - [yarn](#yarn)
  - [API](#api)
  - [Example](#example)
    - [Initialize](#initialize)
    - [Compute Routes](#compute-routes)
    - [Create Transaction(s) from Routes](#create-transactions-from-route)

## Installation

### npm

```bash
$ npm install @unstake-it/sol-ag
```

### yarn

```bash
$ yarn add @unstake-it/sol-ag
```

## API

For easy dapp integration without having to install this SDK, we provide a ready-to-use API at https://unstake-it-api.vercel.app

Documentation and examples are available at https://unstake-it-api.vercel.app

## Example

### Initialize

```ts
import { Connection } from "@solana/web3.js";
import { UnstakeAg } from "@/unstake-ag";

const connection = new Connection("https://api.mainnet-beta.solana.com");

// This loads the required accounts for all stake pools
// and jup-ag from on-chain.
// The arg type is `JupiterLoadParams` from jup-ag
const unstake = await UnstakeAg.load({
  cluster: "mainnet-beta",
  connection,
});
```

### Compute Routes

```ts
import { PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";

const stakeAccountPubkey = new PublicKey(...);
const stakeAccount = await getStakeAccount(connection, stakeAccountPubkey);
const routes = await unstake.computeRoutes({
  stakeAccount,
  amountLamports: BigInt(stakeAccount.lamports),
  slippagePct: 0.1,
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
```

### Create Transaction(s) From Route

```ts
// returned transactions do not have `recentBlockhash` or `feePayer` set
// and have nothing signed
const { setupTransaction, unstakeTransaction, cleanupTransaction } =
  await unstake.exchange({
    route: bestRoute,
    stakeAccount,
    stakeAccountPubkey,
    user: stakeAccount.data.info.meta.authorized.withdrawer,
  });
```

## Learn More

- [SDK Typedoc](https://unstake-ag.vercel.app)
- [unstake.it](https://unstake.it)
- [twitter](https://twitter.com/unstakeit)