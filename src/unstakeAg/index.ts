import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token-v2";
import {
  AccountInfo,
  Cluster,
  Connection,
  PublicKey,
  StakeProgram,
  Transaction,
} from "@solana/web3.js";
import { Jupiter, JupiterLoadParams, WRAPPED_SOL_MINT } from "@jup-ag/core";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import { STAKE_ACCOUNT_RENT_EXEMPT_LAMPORTS } from "@soceanfi/stake-pool-sdk";
import { UnstakeRoute } from "route";

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
import {
  calcStakeUnstakedAmount,
  chunkedGetMultipleAccountInfos,
  dedupPubkeys,
  doTokenProgramAccsExist,
  dummyAccountInfoForProgramOwner,
  genShortestUnusedSeed,
  UNUSABLE_JUP_MARKETS_LABELS,
} from "@/unstake-ag/unstakeAg/utils";
import { WithdrawStakePool } from "@/unstake-ag/withdrawStakePools";

export { routeMarketLabels } from "./utils";

export type HybridPool = StakePool & WithdrawStakePool;

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
   * Same as jupiter's. For refreshing stakePools.
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
   * PublicKeys of all accounts of StakePools + WithdrawStakePools, deduped
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

  async computeRoutes({
    stakeAccount,
    amountLamports: amountLamportsArgs,
    slippageBps,
    jupFeeBps,
    forceFetch = false,
    shouldIgnoreRouteErrors = true,
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
    const msSinceLastFetch = Date.now() - this.lastUpdatePoolsTimestamp;
    if (
      (this.routeCacheDuration > -1 &&
        msSinceLastFetch > this.routeCacheDuration) ||
      forceFetch
    ) {
      await this.updatePools();
      this.lastUpdatePoolsTimestamp = Date.now();
    }

    const { epoch: currentEpoch } = await this.connection.getEpochInfo();
    // each stakePool returns array of routes
    const maybeRoutes = await Promise.all(
      [...this.stakePools, ...this.hybridPools].map(async (sp) => {
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
}

/**
 *
 * @param param0
 * @returns expected amount of lamports to be received for the given unstake route,
 *          excluding slippage.
 */
export function outLamports({ stakeAccInput, jup }: UnstakeRoute): bigint {
  if (!jup) {
    return stakeAccInput.outAmount;
  }
  return BigInt(jup.outAmount.toString());
}

export function tryMergeExchangeReturn(
  user: PublicKey,
  { setupTransaction, unstakeTransaction, cleanupTransaction }: ExchangeReturn,
): ExchangeReturn {
  let newSetupTransaction = setupTransaction;
  let newUnstakeTransaction = unstakeTransaction;
  let newCleanupTransaction = cleanupTransaction;

  if (setupTransaction) {
    const mergeSetup = tryMerge2Txs(user, setupTransaction, unstakeTransaction);
    if (mergeSetup) {
      newSetupTransaction = undefined;
      newUnstakeTransaction = mergeSetup;
    }
  }

  if (cleanupTransaction) {
    const mergeCleanup = tryMerge2Txs(
      user,
      newUnstakeTransaction,
      cleanupTransaction,
    );
    if (mergeCleanup) {
      newCleanupTransaction = undefined;
      newUnstakeTransaction = mergeCleanup;
    }
  }
  return {
    setupTransaction: newSetupTransaction,
    unstakeTransaction: newUnstakeTransaction,
    cleanupTransaction: newCleanupTransaction,
  };
}

/**
 * TODO: Check that additional signatures required are accounted for
 * i.e. actual tx size is `tx.serialize().length`
 * and not `tx.serialize().length + 64 * additional required signatures`
 * @param feePayer
 * @param firstTx
 * @param secondTx
 * @returns a new transaction with the 2 transaction's instructions merged if possible, null otherwise
 */
function tryMerge2Txs(
  feePayer: PublicKey,
  firstTx: Transaction,
  secondTx: Transaction,
): Transaction | null {
  const MOCK_BLOCKHASH = "41xkyTsFaxnPvjv3eJMdjGfmQj3osuTLmqC3P13stSw3";
  const SERIALIZE_CONFIG = {
    requireAllSignatures: false,
    verifyAllSignatures: false,
  };
  const merged = new Transaction();
  merged.add(...firstTx.instructions);
  merged.add(...secondTx.instructions);
  merged.feePayer = feePayer;
  merged.recentBlockhash = MOCK_BLOCKHASH;
  try {
    merged.serialize(SERIALIZE_CONFIG);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg && msg.includes("Transaction too large")) {
      return null;
    }
    // uncaught
    throw e;
  }
  merged.feePayer = undefined;
  merged.recentBlockhash = undefined;
  return merged;
}

export interface ComputeRoutesParams {
  /**
   * The stake account to be unstaked
   */
  stakeAccount: AccountInfo<StakeAccount>;

  /**
   * The amount in lamports to be unstaked.
   * Should be <= stakeAccount.lamports.
   * If < stakeAccount.lamports, a stake split instruction will be
   * added to the setup instructions
   */
  amountLamports: bigint;

  /**
   * In basis point (0 - 10_000)
   */
  slippageBps: number;

  /**
   * Same as `jupiter.computeRoutes()` 's `forceFetch`:
   * If true, refetches all jup accounts and stake pool accounts
   *
   * Default to false
   */
  forceFetch?: boolean;

  /**
   * Optional additional fee to charge on jup swaps,
   * passed as `feeBps` to `jupiter.computeRoutes()`
   *
   * Defaults to undefined
   */
  jupFeeBps?: number;

  /**
   * Silently ignore routes where errors were thrown
   * during computation such as failing to fetch
   * required accounts.
   *
   * Defaults to true
   */
  shouldIgnoreRouteErrors?: boolean;
}

export interface ExchangeParams {
  /**
   * A route returned by `computeRoutes()`
   */
  route: UnstakeRoute;

  /**
   * Fetched on-chain data of the stake account
   * to unstake
   */
  stakeAccount: AccountInfo<StakeAccount>;

  /**
   * Pubkey of the stake account to unstake
   */
  stakeAccountPubkey: PublicKey;

  /**
   * Withdraw authority of the stake account to unstake
   */
  user: PublicKey;

  /**
   * Wrapped SOL account to receive optional additional fee on
   * jup swaps when `jupFeeBps` is set on `computeRoutes()`
   */
  feeAccounts?: FeeAccounts;
}

/**
 * Map of token mint to token accounts to receive referral fees
 * If token is So11111111111111111111111111111111111111112,
 * the value should be a wrapped SOL token account, not a system account.
 * SyncNative is not guaranteed to be called after transferring SOL referral fees
 */
export type FeeAccounts = {
  [token in string]?: PublicKey;
};

export interface ExchangeReturn {
  setupTransaction?: Transaction;
  unstakeTransaction: Transaction;
  cleanupTransaction?: Transaction;
}
