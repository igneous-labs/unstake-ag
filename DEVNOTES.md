# Dev Notes

Random scribblings to make sure we don't forget why some tech decisions were made.

## ytf are there 3 numerical libs - bn.js, jsbi, native bigint?

- bn.js for `@soceanfi/solana-stake-sdk` and for borsh deserialization
- JSBI for `@jup-ag/core`
- bigint because its native and dependency-free

In the long run, everything should move to native bigint, especially the outward-facing interfaces. Right now `getQuote()` uses JSBI because the original intention was to make something as close to jup as possible so that they can easily reference the code here to integrate us.