import { Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";

import { UnstakeAg } from "@/unstake-ag";

describe("test basic functionality", () => {
  it("load and route", async () => {
    const testStakeAccPubkey = new PublicKey(
      "8rmCcsqJcLxdvJmaP9vqtM74vppRSCzr8kg7jsxFHPHT",
    );
    const conn = new Connection("https://solana-api.projectserum.com");
    const unstake = await UnstakeAg.load("mainnet-beta", conn);
    const stakeAccount = await getStakeAccount(conn, testStakeAccPubkey);
    console.log(
      await unstake.computeRoutes({
        stakeAccount,
        amountLamports: BigInt(stakeAccount.lamports),
      }),
    );
  });
});
