# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Note: Version 0 of Semantic Versioning is handled differently from version 1 and above. The minor version will be incremented upon a breaking change and the patch version will be incremented for features.

## [UNRELEASED]

### Added

- Util function `legacyTxAmmsToExclude()` to create an `ammsToExclude` object with all known AMMs that would cause legacy transaction size issues.
- Util function `minOutLamports()` and `minOutLamportsXSol()` for returning output lamports after max allowed slippage.

### Changed

- `splStakePool.depositAuth` now defaults to the default deposit authority PDA, and is updated to the one stored in the account when the account is fetched.
- Upgrade `@jup-ag/core` to `3.0.0-beta.8`  
- No longer initialize jup with a compulsory set of `ammsToExclude`, since all markets should be able to fit into one tx with LUTs. It is now the responsibility of the user to initialize `UnstakeAg` with the desired `ammsToExclude`.

## [0.3.2] - 2022-11-19

### Fixed

- Clobbering `stakePoolsToExclude` in `computeRoutesXSol()`

### Added

- Doc for lut feature

### Changed

- Explicit union types for labels. Typescript will now check validity of keys in `stakePoolsToExclude` 

## [0.3.1] - 2022-11-18

### Added

- Utility script for creating lookup tables of all pools used and some common accounts in `scripts/lut.ts` (call with `yarn lut`)
- Optional `currentEpoch` argument in `ComputeRoutesXSolParams` to enable `computeRoutesXSol()` to be ran with fewer RPC calls (was previously added to `ComputeRoutesParams` as well).
- Optional `assumeAtasExist` argument in `ExchangeParams` and `ExchangeXSolParams` to exclude checking against on-chain data to determine whether the user has the required associated token accounts for an unstake.
- Optional `splitStakeAccount` arg in `ExchangeParams` and `newStakeAccount` in `ExchangeXSolParams` to pass in precomputed `PubkeyFromSeed` or `Keypair` to avoid computing one live for split stake accounts.

### Changed

- Refactor `MarinadeStakePool` so that its constructor and `AddressMap` is more consistent with the other pools. 

## [0.3.0] - 2022-11-17

### Added

- Support for unstaking xSOL (liquid staking derivatives)
- laineSOL
- stSOL

## [0.2.0] - 2022-11-15

### Fixed

- `routeCacheDuration = -1` behaviour was previously equivalent to `= 0` behaviour. Fixed it to match jup's.

### Added

- `forceFetch` parameter to match jup's
- Jito Stake Pool

### Changed

- (BREAKING) `jupFeeAccount` single wSOL account -> `feeAccounts` map of token mints to token accounts to receive referral fees from both jup and stake pools
- Use jupiter's `ammsToExclude` param to control which DEXes can't be used
- Add GooseFX to ammsToExclude list due to too many accounts when trying to swap mSOL -> SOL

## [0.1.4] - 2022-11-12

### Added

- Option to add `feeBps` to jup swaps
- Resolutions for `node-fetch` and `cross-fetch`, resolve dependabot security alert

### Changed

- Factored out `UnstakeAg.createStakePools()` to allow for easy creation of `UnstakeAg` with existing `Jupiter` objects
- Minor optimization to `exchange()` to batch getAccount() calls together
- Update `@jup-ag/core` to `3.0.0-beta.6`

## [0.1.3] - 2022-10-27

### Fixed

- ESM not working correctly due to import issues with CommonJS modules

## [0.1.1] - 2022-10-27

### Added

- Missing repository URL

### Fixed

- README example

## [0.1.0] - 2022-10-27
Initial release
