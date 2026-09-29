/**
 * LaunchpadV2BondingCurve - one instance per launch.
 *
 * IMPORTANT: the published source for this contract is stale and omits the
 * anti-snipe surface that the deployed bytecode actually has. Every entry here
 * was confirmed against deployed bytecode by selector probe. See
 * docs/CONTRACTS.md section 9.
 */
export const v2CurveAbi = [
  // --- trading -------------------------------------------------------------
  {
    type: 'function',
    name: 'buy', // 0x59a87bc1
    stateMutability: 'payable',
    inputs: [
      { name: 'quoteIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sell', // 0xd04c6983
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minQuoteOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [{ name: 'quoteOut', type: 'uint256' }],
  },
  // --- state ---------------------------------------------------------------
  {
    type: 'function',
    name: 'getReserves', // 0x0902f1ac - quoteReserve INCLUDES phantomQuote
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'quoteReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'realQuoteReserve',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellableTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'reservedTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'readyToGraduate',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'graduated',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'creatorTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'phantomQuote',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'graduationThreshold',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isNativeQuote',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'pairToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'token',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  // Absent from the published source; present on chain. Required for correct
  // buy quotes during a launch's opening window, where the tax starts at 99%.
  {
    type: 'function',
    name: 'currentSnipeTaxBps', // 0xd7e1ef39
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  // --- events --------------------------------------------------------------
  // topic0 0xec36bf571f136799e8dc0b0b8bea4b04d8bd3d43de838aab0d5fc21d4cbfc455
  {
    type: 'event',
    name: 'CurveBuy',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  // topic0 0x8113d738abdcb6b38357e9d53a54a7157861a09031b453651f0fe7fe151f59df
  {
    type: 'event',
    name: 'CurveSell',
    inputs: [
      { name: 'seller', type: 'address', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
      { name: 'tax', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveBuyRefunded',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'refund', type: 'uint256', indexed: false },
    ],
  },
] as const
