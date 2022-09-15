import {
  AccountInfo,
  Cluster,
  Connection,
  PublicKey,
  StakeProgram,
} from "@solana/web3.js";
import { WRAPPED_SOL_MINT } from "@jup-ag/core";
import { StakeAccount } from "@soceanfi/solana-stake-sdk";
import JSBI from "jsbi";
import { UnstakeRoute } from "route";
import { UnstakeIt } from "stakePools/unstakeit";

import { StakePool } from "@/unstake-ag/stakePools";
import { UNSTAKE_IT_ADDRESS_MAP } from "@/unstake-ag/unstakeAg/address";
import { chunkedGetMultipleAccountInfos } from "@/unstake-ag/unstakeAg/utils";

/**
 * Main exported class
 */
export class UnstakeAg {
  stakePools: StakePool[];

  cluster: Cluster;

  connection: Connection;

  get accountsToUpdate(): PublicKey[] {
    return this.stakePools.map((sp) => sp.getAccountsForUpdate()).flat();
  }

  constructor(cluster: Cluster, connection: Connection) {
    this.cluster = cluster;
    this.connection = connection;
    // TODO: add other StakePools
    // TODO: add Jup instance
    this.stakePools = [
      new UnstakeIt(
        UNSTAKE_IT_ADDRESS_MAP[cluster].pool,
        // just a dummy account to pass owner in
        {
          executable: false,
          owner: UNSTAKE_IT_ADDRESS_MAP[cluster].program,
          lamports: 0,
          data: Buffer.from(""),
        },
      ),
    ];
  }

  // copied from jup's prefetchAmms
  async updateStakePools(): Promise<void> {
    const accountsStr = this.accountsToUpdate.map((pk) => pk.toBase58());
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
    await this.updateStakePools();

    const { epoch: currentEpoch } = await this.connection.getEpochInfo();
    return this.stakePools
      .map((sp) => {
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
        const res = {
          stakeAccInput: {
            stakePool: sp,
            inAmount: amountLamports,
            outAmount: BigInt(outAmount.toString()),
          },
        };
        if (sp.outputToken.equals(WRAPPED_SOL_MINT)) {
          return res;
        }
        // TODO: if sp.outputToken !== SOL, continue route through jupiter to reach SOL
        return null;
      })
      .filter((maybeNull) => Boolean(maybeNull)) as UnstakeRoute[];
  }

  // TODO: method for converting route to Transactions
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
  amountLamports: BigInt;
}
