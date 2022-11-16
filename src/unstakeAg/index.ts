import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  Cluster,
  Connection,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { Jupiter, JupiterLoadParams, WRAPPED_SOL_MINT } from "@jup-ag/core";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import { UnstakeXSolRouteWithdrawStake } from "index";

import type {
  UnstakeRoute,
  UnstakeXSolRoute,
  UnstakeXSolRouteJupDirect,
} from "@/unstake-ag/route";
import {
  EverstakeSplStakePool,
  MarinadeStakePool,
  OfficialSplStakePool,
  SoceanSplStakePool,
  StakePool,
  UnstakeIt,
} from "@/unstake-ag/stakePools";
import {
  DAOPOOL_ADDRESS_MAP,
  EVERSOL_ADDRESS_MAP,
  JITO_ADDRESS_MAP,
  JPOOL_ADDRESS_MAP,
  LAINE_ADDRESS_MAP,
  MARINADE_ADDRESS_MAP,
  SOCEAN_ADDRESS_MAP,
  SOLBLAZE_ADDRESS_MAP,
  UNSTAKE_IT_ADDRESS_MAP,
} from "@/unstake-ag/unstakeAg/address";
import type {
  ComputeRoutesParams,
  ComputeRoutesXSolParams,
  ExchangeParams,
  ExchangeReturn,
  ExchangeXSolParams,
  HybridPool,
} from "@/unstake-ag/unstakeAg/types";
import {
  calcStakeUnstakedAmount,
  chunkedGetMultipleAccountInfos,
  dedupPubkeys,
  doTokenProgramAccsExist,
  dummyAccountInfoForProgramOwner,
  genShortestUnusedSeed,
  isHybridPool,
  isXSolRouteJupDirect,
  outLamports,
  outLamportsXSol,
  tryMergeExchangeReturn,
  UNUSABLE_JUP_MARKETS_LABELS,
} from "@/unstake-ag/unstakeAg/utils";
import { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

/**
 * Main exported class
 */
export class UnstakeAg {
  /**
   * Pools that only implement StakePool
   */
  stakePools: StakePool[];

  /**
   * Pools that only implement WithdrawStakePool;
   */
  withdrawStakePools: WithdrawStakePool[];

  /**
   * Pools that implement both StakePool and WithdrawStakePool.
   * Should have no overlap with `stakePools` and `withdrawStakePools`
   */
  hybridPools: HybridPool[];

  cluster: Cluster;

  connection: Connection;

  jupiter: Jupiter;

  /**
   * Same as jupiter's. For refreshing pools.
   *
   * -1, it will not fetch when shouldFetch == false
   *
   * 0, it will fetch everytime
   *
   * A duration in ms, the time interval between AMM accounts refetch, recommendation for a UI 20 seconds
   *
   * Defaults to 0
   */
  routeCacheDuration: number;

  lastUpdatePoolsTimestamp: number;

  /**
   * PublicKeys of all accounts of all pools, deduped
   */
  // initialized in this.setPoolsAccountsToUpdate() but ts cant detect that
  // @ts-ignore
  poolsAccountsToUpdate: string[];

  constructor(
    { cluster, connection, routeCacheDuration }: JupiterLoadParams,
    stakePools: StakePool[],
    withdrawStakePools: WithdrawStakePool[],
    hybridPools: HybridPool[],
    jupiter: Jupiter,
  ) {
    this.cluster = cluster;
    this.connection = connection;
    this.routeCacheDuration = routeCacheDuration ?? 0;
    this.stakePools = stakePools;
    this.withdrawStakePools = withdrawStakePools;
    this.hybridPools = hybridPools;
    this.jupiter = jupiter;
    this.lastUpdatePoolsTimestamp = 0;
    this.setPoolsAccountsToUpdate();
  }

  static createStakePools(cluster: Cluster): StakePool[] {
    // TODO: add other StakePools
    return [
      new UnstakeIt(
        UNSTAKE_IT_ADDRESS_MAP[cluster].pool,
        dummyAccountInfoForProgramOwner(
          UNSTAKE_IT_ADDRESS_MAP[cluster].program,
        ),
      ),
      new MarinadeStakePool(
        MARINADE_ADDRESS_MAP[cluster].state,
        dummyAccountInfoForProgramOwner(MARINADE_ADDRESS_MAP[cluster].program),
        {
          validatorRecordsAddr: MARINADE_ADDRESS_MAP[cluster].validatorRecords,
        },
      ),
    ];
  }

  // TODO: lido
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static createWithdrawStakePools(_cluster: Cluster): WithdrawStakePool[] {
    return [];
  }

  static createHybridPools(cluster: Cluster): HybridPool[] {
    return [
      new SoceanSplStakePool(
        SOCEAN_ADDRESS_MAP[cluster].stakePool,
        dummyAccountInfoForProgramOwner(SOCEAN_ADDRESS_MAP[cluster].program),
        {
          validatorListAddr: SOCEAN_ADDRESS_MAP[cluster].validatorList,
          outputToken: SOCEAN_ADDRESS_MAP[cluster].stakePoolToken,
          label: "Socean",
        },
      ),
      new EverstakeSplStakePool(
        EVERSOL_ADDRESS_MAP[cluster].stakePool,
        dummyAccountInfoForProgramOwner(EVERSOL_ADDRESS_MAP[cluster].program),
        {
          validatorListAddr: EVERSOL_ADDRESS_MAP[cluster].validatorList,
          outputToken: EVERSOL_ADDRESS_MAP[cluster].stakePoolToken,
          label: "Eversol",
        },
      ),
      ...[
        { splAddrMap: JPOOL_ADDRESS_MAP, label: "JPool" },
        { splAddrMap: SOLBLAZE_ADDRESS_MAP, label: "SolBlaze" },
        { splAddrMap: DAOPOOL_ADDRESS_MAP, label: "DAOPool" },
        { splAddrMap: JITO_ADDRESS_MAP, label: "Jito" },
        { splAddrMap: LAINE_ADDRESS_MAP, label: "Laine" },
      ].map(
        ({ splAddrMap, label }) =>
          new OfficialSplStakePool(
            splAddrMap[cluster].stakePool,
            dummyAccountInfoForProgramOwner(splAddrMap[cluster].program),
            {
              validatorListAddr: splAddrMap[cluster].validatorList,
              outputToken: splAddrMap[cluster].stakePoolToken,
              label,
            },
          ),
      ),
    ];
  }

  static async load(params: JupiterLoadParams): Promise<UnstakeAg> {
    // we can't use serum markets anyway
    params.shouldLoadSerumOpenOrders = false;
    params.ammsToExclude = params.ammsToExclude ?? {};
    for (const amm of UNUSABLE_JUP_MARKETS_LABELS) {
      params.ammsToExclude[amm] = true;
    }
    // TODO: this throws `missing <Account>` sometimes
    // if RPC is slow to return. Not sure how to mitigate
    const jupiter = await Jupiter.load(params);
    const { cluster } = params;
    const stakePools = UnstakeAg.createStakePools(cluster);
    const withdrawStakePools = UnstakeAg.createWithdrawStakePools(cluster);
    const hybridPools = UnstakeAg.createHybridPools(cluster);
    const res = new UnstakeAg(
      params,
      stakePools,
      withdrawStakePools,
      hybridPools,
      jupiter,
    );
    await res.updatePools();
    return res;
  }

  /**
   * Sets this.poolsAccountsToUpdate to deduped list of all
   * required accounts for StakePools and WithdrawStakePools.
   * Call this if this.stakePools or this.withdrawStakePools
   * change for some reason.
   */
  setPoolsAccountsToUpdate(): void {
    const allPubkeys = [
      this.stakePools,
      this.withdrawStakePools,
      this.hybridPools,
    ].flatMap((pools) => pools.flatMap((p) => p.getAccountsForUpdate()));
    this.poolsAccountsToUpdate = dedupPubkeys(allPubkeys);
  }

  // copied from jup's prefetchAmms
  // TODO: ideally we use the same accountInfosMap as jupiter
  // so we dont fetch duplicate accounts e.g. marinade state
  async updatePools(): Promise<void> {
    const accountInfosMap = new Map();
    const accountInfos = await chunkedGetMultipleAccountInfos(
      this.connection,
      this.poolsAccountsToUpdate,
    );
    accountInfos.forEach((item, index) => {
      const publicKeyStr = this.poolsAccountsToUpdate[index];
      if (item) {
        accountInfosMap.set(publicKeyStr, item);
      }
    });
    [this.stakePools, this.withdrawStakePools, this.hybridPools].forEach(
      (pools) => pools.forEach((p) => p.update(accountInfosMap)),
    );
  }

  async refreshPoolsIfExpired(forceFetch: boolean): Promise<void> {
    const msSinceLastFetch = Date.now() - this.lastUpdatePoolsTimestamp;
    if (
      (this.routeCacheDuration > -1 &&
        msSinceLastFetch > this.routeCacheDuration) ||
      forceFetch
    ) {
      await this.updatePools();
      this.lastUpdatePoolsTimestamp = Date.now();
    }
  }

  async computeRoutes({
    stakeAccount,
    amountLamports: amountLamportsArgs,
    slippageBps,
    jupFeeBps,
    currentEpoch: currentEpochOption,
    forceFetch = false,
    shouldIgnoreRouteErrors = true,
    stakePoolsToExclude,
  }: ComputeRoutesParams): Promise<UnstakeRoute[]> {
    if (
      amountLamportsArgs < BigInt(STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS.toString())
    ) {
      return [];
    }
    const amountLamports =
      amountLamportsArgs > BigInt(stakeAccount.lamports)
        ? BigInt(stakeAccount.lamports)
        : amountLamportsArgs;

    await this.refreshPoolsIfExpired(forceFetch);

    const currentEpoch =
      currentEpochOption ?? (await this.connection.getEpochInfo()).epoch;

    // each stakePool returns array of routes
    let pools = [...this.stakePools, ...this.hybridPools];
    if (stakePoolsToExclude) {
      pools = pools.filter(({ label }) => !stakePoolsToExclude[label]);
    }
    const maybeRoutes = await Promise.all(
      pools.map(async (sp) => {
        try {
          if (
            !sp.canAcceptStakeAccount({
              amountLamports,
              currentEpoch,
              stakeAccount,
            })
          ) {
            return null;
          }
          const { stakeAmount, unstakedAmount } = calcStakeUnstakedAmount(
            amountLamports,
            stakeAccount,
            currentEpoch,
          );
          const { outAmount, notEnoughLiquidity } = sp.getQuote({
            sourceMint:
              stakeAccount.data.info.stake?.delegation.voter ??
              StakeProgram.programId,
            stakeAmount,
            unstakedAmount,
          });
          if (notEnoughLiquidity) {
            return null;
          }
          const stakePoolRoute = {
            stakeAccInput: {
              stakePool: sp,
              inAmount: amountLamports,
              outAmount: BigInt(outAmount.toString()),
            },
          };
          if (sp.outputToken.equals(WRAPPED_SOL_MINT)) {
            return [stakePoolRoute];
          }
          // If sp.outputToken !== SOL, continue route through jupiter to reach SOL
          const { routesInfos } = await this.jupiter.computeRoutes({
            inputMint: sp.outputToken,
            outputMint: WRAPPED_SOL_MINT,
            amount: outAmount,
            slippageBps,
            onlyDirectRoutes: true,
            feeBps: jupFeeBps,
            forceFetch,
          });
          return routesInfos.map((jupRoute) => ({
            ...stakePoolRoute,
            jup: jupRoute,
          }));
        } catch (e) {
          if (shouldIgnoreRouteErrors) {
            return null;
          }
          throw e;
        }
      }),
    );
    const routes = maybeRoutes
      .filter((maybeNull) => Boolean(maybeNull))
      .flat() as UnstakeRoute[];
    // sort by best route first (out lamports is the most)
    return routes.sort((routeA, routeB) => {
      const res = outLamports(routeB) - outLamports(routeA);
      // bigint-number incompatibility,
      // cant do `return res;`
      if (res < 0) {
        return -1;
      }
      if (res > 0) {
        return 1;
      }
      return 0;
    });
  }

  async exchange({
    route: {
      stakeAccInput: { stakePool, inAmount },
      jup,
    },
    stakeAccount,
    stakeAccountPubkey: inputStakeAccount,
    user,
    feeAccounts = {},
  }: ExchangeParams): Promise<ExchangeReturn> {
    if (!stakeAccount.data.info.stake) {
      throw new Error("stake account not delegated");
    }

    const { epoch: currentEpoch } = await this.connection.getEpochInfo();
    const withdrawerAuth = stakeAccount.data.info.meta.authorized.withdrawer;
    const stakerAuth = stakeAccount.data.info.meta.authorized.staker;
    const setupIxs = [];
    const unstakeIxs = [];
    const cleanupIxs = [];
    // Pubkey of the actual stake account to be unstaked:
    // either inputStakeAccount or an ephemeral one split from it
    let stakeAccountPubkey = inputStakeAccount;
    if (inAmount < stakeAccount.lamports) {
      const { derived: splitStakePubkey, seed } = await genShortestUnusedSeed(
        this.connection,
        user,
        StakeProgram.programId,
      );
      stakeAccountPubkey = splitStakePubkey;
      setupIxs.push(
        ...StakeProgram.splitWithSeed({
          stakePubkey: inputStakeAccount,
          authorizedPubkey: stakerAuth,
          splitStakePubkey,
          basePubkey: user,
          seed,
          lamports: Number(inAmount),
        }).instructions,
      );
    }
    setupIxs.push(
      ...stakePool.createSetupInstructions({
        payer: user,
        stakeAccount,
        stakeAccountPubkey,
        currentEpoch,
      }),
    );

    const isDirectToSol = stakePool.outputToken.equals(WRAPPED_SOL_MINT);
    const destinationTokenAccount = isDirectToSol
      ? user
      : await getAssociatedTokenAddress(stakePool.outputToken, user);
    // Create ATAs for intermediate xSOL and wSOL if not exist
    if (!isDirectToSol) {
      const wSolTokenAcc = await getAssociatedTokenAddress(
        WRAPPED_SOL_MINT,
        user,
      );
      const [intermediateAtaExists, wSolAtaExists] =
        await doTokenProgramAccsExist(this.connection, [
          destinationTokenAccount,
          wSolTokenAcc,
        ]);
      if (!intermediateAtaExists) {
        setupIxs.push(
          createAssociatedTokenAccountInstruction(
            user,
            destinationTokenAccount,
            user,
            stakePool.outputToken,
          ),
        );
      }
      // we handle wrap-unwrap SOL in setup-cleanup txs in order
      // to reserve max space for the unstake tx
      if (!wSolAtaExists) {
        setupIxs.push(
          createAssociatedTokenAccountInstruction(
            user,
            wSolTokenAcc,
            user,
            WRAPPED_SOL_MINT,
          ),
        );
      }
      cleanupIxs.push(createCloseAccountInstruction(wSolTokenAcc, user, user));
    }

    unstakeIxs.push(
      ...stakePool.createSwapInstructions({
        withdrawerAuth,
        stakerAuth,
        payer: user,
        stakeAccountPubkey,
        stakeAccountVotePubkey: stakeAccount.data.info.stake.delegation.voter,
        destinationTokenAccount,
        feeAccount: feeAccounts[stakePool.outputToken.toString()],
      }),
    );

    cleanupIxs.push(
      ...stakePool.createCleanupInstruction({
        payer: user,
        stakeAccountPubkey,
        stakeAccount,
        currentEpoch,
        destinationTokenAccount,
      }),
    );

    if (jup) {
      const {
        transactions: { setupTransaction, swapTransaction, cleanupTransaction },
      } = await this.jupiter.exchange({
        routeInfo: jup,
        userPublicKey: user,
        // since we're putting it in setup and cleanup always
        wrapUnwrapSOL: false,
        feeAccount: feeAccounts[WRAPPED_SOL_MINT.toString()],
      });
      if (setupTransaction) {
        setupIxs.push(...setupTransaction.instructions);
      }
      // jup detail:
      // exchange() still adds create wrapped SOL ix despite `wrapUnwrapSOL: false`
      // because SOL is not the input token.
      // So just delete all associated token prog instructions
      // since we are handling it above already,
      // and we shouldnt have any other intermediate tokens anyway
      // since `onlyDirectRoutes: true`
      const filteredSwapIx = swapTransaction.instructions.filter(
        (ix) => !ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID),
      );
      unstakeIxs.push(...filteredSwapIx);
      if (cleanupTransaction) {
        cleanupIxs.push(...cleanupTransaction.instructions);
      }
    }

    let setupTransaction;
    if (setupIxs.length > 0) {
      setupTransaction = new Transaction();
      setupTransaction.add(...setupIxs);
    }

    const unstakeTransaction = new Transaction();
    unstakeTransaction.add(...unstakeIxs);

    let cleanupTransaction;
    if (cleanupIxs.length > 0) {
      cleanupTransaction = new Transaction();
      cleanupTransaction.add(...cleanupIxs);
    }

    return tryMergeExchangeReturn(user, {
      setupTransaction,
      unstakeTransaction,
      cleanupTransaction,
    });
  }

  async computeRoutesXSol(
    args: ComputeRoutesXSolParams,
  ): Promise<UnstakeXSolRoute[]> {
    const outputMint = WRAPPED_SOL_MINT;
    const {
      inputMint,
      amount,
      slippageBps,
      feeBps: jupFeeBps,
      forceFetch = false,
      shouldIgnoreRouteErrors = true,
      stakePoolsToExclude: stakePoolsToExcludeOption,
    } = args;

    await this.refreshPoolsIfExpired(forceFetch);

    const jupRoutesPromise: Promise<UnstakeXSolRouteJupDirect[]> = this.jupiter
      .computeRoutes({ ...args, outputMint })
      .then(({ routesInfos }) =>
        routesInfos.flatMap((routeInfo) => ({ jup: routeInfo })),
      )
      .catch((e) => {
        if (shouldIgnoreRouteErrors) {
          return [] as UnstakeXSolRouteJupDirect[];
        }
        throw e;
      });

    const pool: WithdrawStakePool | undefined = [
      ...this.hybridPools,
      ...this.withdrawStakePools,
    ].find((p) => p.withdrawStakeToken.equals(inputMint));
    let unstakeRoutesPromise: Promise<UnstakeXSolRouteWithdrawStake[]>;
    if (!pool) {
      unstakeRoutesPromise = Promise.resolve([]);
    } else {
      unstakeRoutesPromise = this.connection
        .getEpochInfo()
        .then(async ({ epoch: currentEpoch }) => {
          const { result } = pool.getWithdrawStakeQuote({
            currentEpoch,
            tokenAmount: BigInt(amount.toString()),
          });
          if (!result) {
            return [];
          }
          const { outputDummyStakeAccountInfo, stakeSplitFrom } = result;
          const outAmount = BigInt(outputDummyStakeAccountInfo.lamports);
          let stakePoolsToExclude = stakePoolsToExcludeOption;
          // withdrawing the stake, then depositing the stake
          // again = back to xSOL
          if (
            isHybridPool(pool) &&
            pool.outputToken.equals(pool.withdrawStakeToken)
          ) {
            stakePoolsToExclude = {
              [pool.label]: true,
            };
          }
          const unstakeRoutes = await this.computeRoutes({
            stakeAccount: outputDummyStakeAccountInfo,
            amountLamports: outAmount,
            slippageBps,
            jupFeeBps,
            currentEpoch,
            forceFetch,
            shouldIgnoreRouteErrors,
            stakePoolsToExclude,
          });
          return unstakeRoutes.map((unstake) => ({
            withdrawStake: {
              withdrawStakePool: pool,
              inAmount: BigInt(amount.toString()),
              outAmount,
              stakeSplitFrom,
            },
            intermediateDummyStakeAccountInfo: outputDummyStakeAccountInfo,
            unstake,
          }));
        })
        .catch((e) => {
          if (shouldIgnoreRouteErrors) {
            return [] as UnstakeXSolRouteWithdrawStake[];
          }
          throw e;
        });
    }

    const routes = (
      await Promise.all([jupRoutesPromise, unstakeRoutesPromise])
    ).flat();
    // sort by best route first (out lamports is the most)
    return routes.sort((routeA, routeB) => {
      const res = outLamportsXSol(routeB) - outLamportsXSol(routeA);
      // bigint-number incompatibility,
      // cant do `return res;`
      if (res < 0) {
        return -1;
      }
      if (res > 0) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * If withdraw stake route, the withdraw stake instruction will be added to setupTransaction.
   * This means its possible for unstake to fail and user to end up with a stake account
   * @param param0
   * @returns
   */
  async exchangeXSol({
    route,
    user,
    srcTokenAccount,
    feeAccounts = {},
  }: ExchangeXSolParams): Promise<ExchangeReturn> {
    if (isXSolRouteJupDirect(route)) {
      const {
        transactions: { swapTransaction, ...rest },
      } = await this.jupiter.exchange({
        routeInfo: route.jup,
        userPublicKey: user,
        wrapUnwrapSOL: true,
        feeAccount: feeAccounts[WRAPPED_SOL_MINT.toString()],
      });
      return { ...rest, unstakeTransaction: swapTransaction };
    }
    const {
      withdrawStake: { withdrawStakePool, inAmount, stakeSplitFrom },
      intermediateDummyStakeAccountInfo,
      unstake,
    } = route;
    const newStakeAccount = await genShortestUnusedSeed(
      this.connection,
      user,
      StakeProgram.programId,
    );
    const withdrawStakeInstructions =
      withdrawStakePool.createWithdrawStakeInstructions({
        payer: user,
        stakerAuth: user,
        withdrawerAuth: user,
        newStakeAccount,
        tokenAmount: inAmount,
        srcTokenAccount,
        srcTokenAccountAuth: user,
        stakeSplitFrom,
      });
    // replace dummy values with real values
    intermediateDummyStakeAccountInfo.data.info.meta.authorized = {
      staker: user,
      withdrawer: user,
    };
    const exchangeReturn = await this.exchange({
      route: unstake,
      stakeAccount: intermediateDummyStakeAccountInfo,
      stakeAccountPubkey: newStakeAccount.derived,
      user,
      feeAccounts,
    });
    if (!exchangeReturn.setupTransaction) {
      exchangeReturn.setupTransaction = new Transaction();
    }
    exchangeReturn.setupTransaction.instructions.unshift(
      ...withdrawStakeInstructions,
    );
    return tryMergeExchangeReturn(user, exchangeReturn);
  }
}

export * from "./address";
export * from "./types";
export * from "./utils";
