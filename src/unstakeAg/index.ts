import {
  AccountInfo,
  Cluster,
  Connection,
  PublicKey,
  StakeProgram,
} from "@solana/web3.js";
import { Jupiter, WRAPPED_SOL_MINT } from "@jup-ag/core";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import JSBI from "jsbi";
import { UnstakeRoute } from "route";
import { SplStakePool } from "stakePools/splStakePool";
import { UnstakeIt } from "stakePools/unstakeit";

import { StakePool } from "@/unstake-ag/stakePools";
import {
  DAOPOOL_ADDRESS_MAP,
  JPOOL_ADDRESS_MAP,
  SOCEAN_ADDRESS_MAP,
  SOLBLAZE_ADDRESS_MAP,
  UNSTAKE_IT_ADDRESS_MAP,
} from "@/unstake-ag/unstakeAg/address";
import {
  chunkedGetMultipleAccountInfos,
  dummyAccountInfoForProgramOwner,
  filterSmallTxSizeJupRoutes,
} from "@/unstake-ag/unstakeAg/utils";

/**
 * Main exported class
 */
export class UnstakeAg {
  stakePools: StakePool[];

  cluster: Cluster;

  connection: Connection;

  jupiter: Jupiter;

  get stakePoolsAccountsToUpdate(): PublicKey[] {
    return this.stakePools.map((sp) => sp.getAccountsForUpdate()).flat();
  }

  constructor(
    cluster: Cluster,
    connection: Connection,
    stakePools: StakePool[],
    jupiter: Jupiter,
  ) {
    this.cluster = cluster;
    this.connection = connection;
    this.stakePools = stakePools;
    this.jupiter = jupiter;
  }

  static async load(
    cluster: Cluster,
    connection: Connection,
  ): Promise<UnstakeAg> {
    // TODO: parameterize routeCacheDuration
    const jupiter = await Jupiter.load({
      connection,
      cluster,
      // TODO: other params
    });

    // TODO: add other StakePools
    const stakePools = [
      new UnstakeIt(
        UNSTAKE_IT_ADDRESS_MAP[cluster].pool,
        dummyAccountInfoForProgramOwner(
          UNSTAKE_IT_ADDRESS_MAP[cluster].program,
        ),
      ),
      ...[
        { splAddrMap: SOCEAN_ADDRESS_MAP, label: "socean" },
        { splAddrMap: JPOOL_ADDRESS_MAP, label: "JPool" },
        { splAddrMap: SOLBLAZE_ADDRESS_MAP, label: "SolBlaze" },
        { splAddrMap: DAOPOOL_ADDRESS_MAP, label: "DAOPool" },
      ].map(
        ({ splAddrMap, label }) =>
          new SplStakePool(
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
    const res = new UnstakeAg(cluster, connection, stakePools, jupiter);
    await res.updateStakePools();
    return res;
  }

  // copied from jup's prefetchAmms
  async updateStakePools(): Promise<void> {
    const accountsStr = this.stakePoolsAccountsToUpdate.map((pk) =>
      pk.toBase58(),
    );
    const accountInfosMap = new Map();
    const accountInfos = await chunkedGetMultipleAccountInfos(
      this.connection,
      accountsStr,
    );
    accountInfos.forEach((item, index) => {
      const publicKeyStr = accountsStr[index];
      if (item) {
        accountInfosMap.set(publicKeyStr, item);
      }
    });
    this.stakePools.forEach((sp) => sp.update(accountInfosMap));
  }

  async computeRoutes({
    stakeAccount,
    amountLamports,
  }: ComputeRoutesParams): Promise<UnstakeRoute[]> {
    // TODO: refreshing stakePools and jup should be controlled by a cache option
    // similar to how jup does it instead of refreshing on every call
    // refresh jup and stake pools
    // await this.updateStakePools();

    const { epoch: currentEpoch } = await this.connection.getEpochInfo();
    // each stakePool returns array of routes
    const maybeRoutes = await Promise.all(
      this.stakePools.map(async (sp) => {
        if (
          !sp.canAcceptStakeAccount({
            currentEpoch,
            stakeAccount,
          })
        ) {
          return null;
        }
        const { outAmount } = sp.getQuote({
          sourceMint:
            stakeAccount.data.info.stake?.delegation.voter ??
            StakeProgram.programId,
          amount: JSBI.BigInt(amountLamports.toString()),
        });
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
          // TODO: parameterize slippage
          slippage: 0.1,
          // jup should've been updated above already
          forceFetch: false,
        });
        const smallRoutes = filterSmallTxSizeJupRoutes(routesInfos);
        if (smallRoutes.length === 0) {
          return null;
        }
        return smallRoutes.map((jupRoute) => ({
          ...stakePoolRoute,
          jup: jupRoute,
        }));
      }),
    );
    const routes = maybeRoutes
      .filter((maybeNull) => Boolean(maybeNull))
      .flat() as UnstakeRoute[];
    // sort by best route first (out lamports is the most)
    return routes.sort((routeA, routeB) => {
      const res = outLamports(routeB) - outLamports(routeA);
      // bigint-number incompatibility
      if (res < 0) {
        return -1;
      }
      if (res > 0) {
        return 1;
      }
      return 0;
    });
  }

  // TODO: method for converting route to Transactions
}

/**
 *
 * @param param0
 * @returns expected amount of lamports to be received for the given unstake route
 */
export function outLamports({ stakeAccInput, jup }: UnstakeRoute): bigint {
  if (!jup) {
    return stakeAccInput.outAmount;
  }
  return BigInt(jup.outAmount.toString());
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
}
