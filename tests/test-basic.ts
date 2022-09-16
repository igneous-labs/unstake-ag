import { Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";

import { UnstakeAg } from "@/unstake-ag";

describe("test basic functionality", () => {
  it("load", async () => {
    const testStakeAccPubkey = new PublicKey(
      "8rmCcsqJcLxdvJmaP9vqtM74vppRSCzr8kg7jsxFHPHT",
    );
    const conn = new Connection("https://api.mainnet-beta.solana.com");
    const unstake = new UnstakeAg("mainnet-beta", conn);
    const stakeAccount = await getStakeAccount(conn, testStakeAccPubkey);
    console.log(
      await unstake.computeRoutes({
        stakeAccount,
        amountLamports: BigInt(stakeAccount.lamports),
      }),
    );
  });
});
