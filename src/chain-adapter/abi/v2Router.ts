/**
 * Launchpad launch-and-buy router (the factory's configured `launchForwarder`).
 *
 * Lets a creator launch and take their own opening position in one atomic
 * transaction, which also exempts them from the opening-window snipe tax the
 * curve would otherwise charge on the first seconds of trading.
 *
 * The selector below was confirmed present in the deployed bytecode
 * (0xf85f8e41). Return values come from the official docs - selectors do not
 * encode them - so the results are taken from simulation rather than trusted.
 *
 * The trailing address[] names up to 32 further wallets exempt from the snipe
 * tax. The creator's own address is exempted by the factory itself.
 */
export const v2RouterAbi = [
  {
    type: 'function',
    name: 'launchAndBuy',
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
      { name: 'quoteIn', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'recipient', type: 'address' },
      { name: 'snipeTaxExemptions', type: 'address[]' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'curve', type: 'address' },
      { name: 'tokensOut', type: 'uint256' },
    ],
  },
] as const
