# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [UNRELEASED]

### Added

- `forceFetch` parameter to match jup's

### Fixed

- `routeCacheDuration = -1` behaviour was previously equivalent to `= 0` behaviour. Fixed it to match jup's.

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
