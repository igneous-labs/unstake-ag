import { PublicKey } from "@solana/web3.js";

import type {
  AddressMap,
  SplStakePoolAccounts,
} from "@/unstake-ag/unstakeAg/address";

// TODO: ideally we use SoceanConfig in @soceanfi/stake-pool-sdk
// but we dont currently export validatorList and stakePoolToken...

export const SOCEAN_ADDRESS_MAP: AddressMap<SplStakePoolAccounts> = {
  devnet: {
    program: new PublicKey("5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx"),
    stakePool: new PublicKey("6NjY29fsq34pTqEmu2CXqGijsGLDSPdHqEyJ3fBkMxtB"),
    validatorList: new PublicKey(
      "HYssvCeMbkepFD5Hyv4q7MeVt6GoSu2jURa3nSKmBPQp",
    ),
    stakePoolToken: new PublicKey(
      "6JWhqnxxkqvmkr23yDpsL1atjeiF6jpNAtV8AozZN5Qq",
    ),
  },
  testnet: {
    program: new PublicKey("5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx"),
    stakePool: new PublicKey("5oc4nDMhYqP8dB5DW8DHtoLJpcasB19Tacu3GWAMbQAC"),
    validatorList: new PublicKey(
      "DAHT9wKeXiqdYtv9sPcyKCq26trTpXG9ov3iyKheFBmF",
    ),
    stakePoolToken: new PublicKey(
      "5oVNVwKYAGeFhvat29XFVH89oXNpLsV8uCPEqSooihsw",
    ),
  },
  "mainnet-beta": {
    program: new PublicKey("5ocnV1qiCgaQR8Jb8xWnVbApfaygJ8tNoZfgPwsgx9kx"),
    stakePool: new PublicKey("5oc4nmbNTda9fx8Tw57ShLD132aqDK65vuHH4RU1K4LZ"),
    validatorList: new PublicKey(
      "8pTa29ovYHxjQgX7gjxGi395GAo8DSXCRTKJZvwMc6MR",
    ),
    stakePoolToken: new PublicKey(
      "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
    ),
  },
};
