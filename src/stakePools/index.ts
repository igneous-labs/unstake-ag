import type {
  AccountInfo,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import type {
  AccountInfoMap,
  Quote,
  QuoteParams,
} from "@jup-ag/core/dist/lib/amm";
import type { StakeAccount } from "@soceanfi/solana-stake-sdk";

/**
 * StakePools can only handle ExactIn swapMode and only ever outputs their own outputToken
 */
export type StakePoolQuoteParams = Omit<
  QuoteParams,
  "destinationMint" | "swapMode"
>;

/**
 * A StakePool in this context is any on-chain entity
 * that accepts stake accounts in return for tokens
 *
 * Classes that implement this should cache relevant on-chain accounts,
 * none of the methods here should perform any rpc calls
 *
 */
export interface StakePool {
  outputToken: PublicKey;

  label: string;

  /**
   * Check if a stake pool can accept the given stake account
   * @param params
   */
  canAcceptStakeAccount(params: CanAcceptStakeAccountParams): boolean;

  /**
   * Commmon setup instructions:
   * - un-deactivate stake account
   *
   * Common setup instructions that are not covered:
   * - split stake.
   *   Why?
   *   - This involves generation and returning of a Keypair and Signer.
   *     Simpler to just handle this outside of this interface
   * - creating `outputToken` ATA if user does not have it yet.
   *   Why?
   *   - This involves a RPC call to check if the user's ATA exists.
   * @param params
   */
  createSetupInstructions(
    params: CreateSetupInstructionsParams,
  ): TransactionInstruction[];

  /**
   * Create the instructions for swapping the given
   * stake account to `outputToken` assuming setup is done
   * Only accepts entire stake accounts.
   */
  createSwapInstructions(
    params: CreateSwapInstructionsParams,
  ): TransactionInstruction[];

  createCleanupInstruction(
    params: CreateCleanupInstructionsParams,
  ): TransactionInstruction[];

  // below methods are same signature as that from @jup-ag/core

  getAccountsForUpdate(): PublicKey[];

  update(accountInfoMap: AccountInfoMap): void;

  getQuote(quoteParams: StakePoolQuoteParams): Quote;
}

interface WithStakeAuths {
  withdrawerAuth: PublicKey;
  stakerAuth: PublicKey;
}

interface WithPayer {
  payer: PublicKey;
}

export interface CanAcceptStakeAccountParams {
  stakeAccount: AccountInfo<StakeAccount>;
  currentEpoch: number;
}

export interface CreateSetupInstructionsParams extends WithPayer {
  stakeAccountPubkey: PublicKey;
  stakeAccount: AccountInfo<StakeAccount>;
  currentEpoch: number;
}

export interface CreateSwapInstructionsParams
  extends WithStakeAuths,
    WithPayer {
  stakeAccountPubkey: PublicKey;
  destinationTokenAccount: PublicKey;

  /**
   * Pubkey of the vote account `stakeAccountPubkey`
   * is delegated to
   */
  stakeAccountVotePubkey: PublicKey;
}

export interface CreateCleanupInstructionsParams extends WithPayer {
  stakeAccountPubkey: PublicKey;
  stakeAccount: AccountInfo<StakeAccount>;
  currentEpoch: number;
  destinationTokenAccount: PublicKey;
}
