/**
 * LaunchpadLaunchFactory (V1).
 *
 * Unlike V2, the V1 source compiles and the repo ships the live ABI as
 * abi.json - we diffed the two and they match exactly. Only the read surface
 * we actually need is reproduced here; launchToken is deliberately omitted
 * because launchEnabled() is false on chain and any call would revert.
 */
export const v1FactoryAbi = [
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
          { name: 'deployer', type: 'address' },
          { name: 'pairedToken', type: 'address' },
          { name: 'positionManager', type: 'address' },
          { name: 'positionId', type: 'uint256' },
          { name: 'dexId', type: 'uint256' },
          { name: 'launchConfigId', type: 'uint256' },
          { name: 'restrictionsEndBlock', type: 'uint256' },
          { name: 'supply', type: 'uint256' },
          { name: 'isToken0', type: 'bool' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'exists', type: 'bool' },
          { name: 'initialBuyAmount', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'graduationStatus',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'pairedPrincipal', type: 'uint256' },
      { name: 'threshold', type: 'uint256' },
      { name: 'graduated', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getDexConfig',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'name', type: 'string' },
          { name: 'factory', type: 'address' },
          { name: 'positionManager', type: 'address' },
          { name: 'swapRouter', type: 'address' },
          { name: 'poolFee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'enabled', type: 'bool' },
        ],
      },
    ],
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
    name: 'launchFee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // topic0 0xdb51ea9ad51ab453a65a4cb7e60c3cb378c9501bb002609f8f97778fb6c4235a
  {
    type: 'event',
    name: 'TokenLaunched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'deployer', type: 'address', indexed: true },
      { name: 'dexFactory', type: 'address', indexed: true },
      { name: 'pairToken', type: 'address', indexed: false },
      { name: 'pool', type: 'address', indexed: false },
      { name: 'dexId', type: 'uint256', indexed: false },
      { name: 'launchConfigId', type: 'uint256', indexed: false },
      { name: 'positionId', type: 'uint256', indexed: false },
      { name: 'restrictionsEndBlock', type: 'uint256', indexed: false },
      { name: 'initialBuyAmount', type: 'uint256', indexed: false },
    ],
  },
] as const
