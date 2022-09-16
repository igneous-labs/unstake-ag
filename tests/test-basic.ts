import { Connection, PublicKey } from "@solana/web3.js";
import { getStakeAccount } from "@soceanfi/solana-stake-sdk";

import { outLamports, UnstakeAg } from "@/unstake-ag";

describe("test basic functionality", () => {
  it("load and route", async () => {
    const testStakeAccPubkey = new PublicKey(
      "8rmCcsqJcLxdvJmaP9vqtM74vppRSCzr8kg7jsxFHPHT",
    );
    const conn = new Connection("https://solana-api.projectserum.com");
    const unstake = await UnstakeAg.load("mainnet-beta", conn);
    const stakeAccount = await getStakeAccount(conn, testStakeAccPubkey);
    const routes = await unstake.computeRoutes({
      stakeAccount,
      amountLamports: BigInt(stakeAccount.lamports),
    });
    console.log(routes);
    console.log(
      routes.map(
        (r) =>
          `${r.stakeAccInput.stakePool.label} ${
            r.jup
              ? `+ ${r.jup.marketInfos.map((m) => m.amm.label).join(" + ")}`
              : ""
          }: ${outLamports(r).toString()}`,
      ),
    );
    console.log(routes.length);
  });
});
