/**
 * LaunchpadV2LaunchFactory.
 *
 * Built from verified function selectors rather than by compiling the repo:
 * the published V2 source does not compile (see docs/CONTRACTS.md section 9).
 * Every entry below was confirmed present in the deployed runtime bytecode,
 * and the struct layouts were confirmed by decoding live mainnet return data.
 */
export const v2FactoryAbi = [
  // --- launching -----------------------------------------------------------
  // selector 0xf35abbcf, and 0xa72101af below, which adds up to 32 wallets
  // exempt from the opening-window snipe tax. launchTokenFor is router-only.
  {
    type: 'function',
    name: 'launchToken',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'logo', type: 'string' },
          { name: 'description', type: 'string' },
          {
            name: 'socials',
            type: 'tuple',
            components: [
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'creatorFeeRecipient', type: 'address' },
          { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' },
          { name: 'expectedEconomics', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
  // selector 0xa72101af
  {
    type: 'function',
    name: 'launchToken',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'symbol', type: 'string' },
          { name: 'logo', type: 'string' },
          { name: 'description', type: 'string' },
          {
            name: 'socials',
            type: 'tuple',
            components: [
              { name: 'twitter', type: 'string' },
              { name: 'telegram', type: 'string' },
              { name: 'discord', type: 'string' },
              { name: 'website', type: 'string' },
              { name: 'farcaster', type: 'string' },
            ],
          },
          { name: 'creatorFeeRecipient', type: 'address' },
          { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' },
          { name: 'expectedEconomics', type: 'bytes32' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
      { name: 'snipeTaxExemptions', type: 'address[]' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
    ],
  },
  // --- reads ---------------------------------------------------------------
  {
    type: 'function',
    name: 'getLaunchedToken',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'token', type: 'address' },
          { name: 'curve', type: 'address' },
          { name: 'deployer', type: 'address' },
          { name: 'creatorFeeRecipient', type: 'address' },
          { name: 'pairToken', type: 'address' },
          { name: 'graduationThreshold', type: 'uint256' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'creatorTaxBps', type: 'uint16' },
          { name: 'buybackEnabled', type: 'bool' },
          { name: 'phase', type: 'uint8' },
          { name: 'sweptQuote', type: 'uint256' },
          { name: 'sweptTokens', type: 'uint256' },
          { name: 'sweptAt', type: 'uint256' },
          { name: 'exists', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getLaunchConfig',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'supply', type: 'uint256' },
          { name: 'curveFeeBps', type: 'uint256' },
          { name: 'phantomQuote', type: 'uint256' },
          { name: 'graduationThreshold', type: 'uint256' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'enabled', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'launchConfigCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'launchFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'launchEnabled',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'maxCreatorTaxBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'snipeTaxStartBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'snipeTaxSeconds',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'canLaunch',
    stateMutability: 'view',
    inputs: [{ name: 'launcher', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'previewLaunchEconomics',
    stateMutability: 'view',
    inputs: [
      { name: 'launchConfigId', type: 'uint256' },
      { name: 'pairToken', type: 'address' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  // --- graduation (both permissionless and retryable) ----------------------
  {
    type: 'function',
    name: 'graduate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'createGraduatedPool',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: 'positionId', type: 'uint256' }],
  },
  // --- events --------------------------------------------------------------
  // topic0 0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'curve', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address', indexed: false },
      { name: 'launchConfigId', type: 'uint256', indexed: false },
      { name: 'graduationThreshold', type: 'uint256', indexed: false },
    ],
  },
  // topic0 0x0a44ef75df69c534f43cd6c1aa3ef8983065fe5fe79ef9e79f6494e6f258c259
  // NB: the official docs describe this with a single argument. That is wrong;
  // this four-argument shape was decoded from a real graduation log.
  {
    type: 'event',
    name: 'PoolGraduated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'positionId', type: 'uint256', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'pairTokenAmount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchSwept',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'quoteOut', type: 'uint256', indexed: false },
      { name: 'tokenOut', type: 'uint256', indexed: false },
    ],
  },
] as const
