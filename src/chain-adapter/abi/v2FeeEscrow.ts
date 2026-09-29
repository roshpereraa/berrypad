/**
 * the launchpad fee escrow.
 *
 * Creator and protocol fee shares accrue here and are PULLED, never pushed:
 * the contract pays only the address recorded at launch, which is why no
 * interface can send anyone their fees, including this one.
 */
export const v2FeeEscrowAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOfToken',
    stateMutability: 'view',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'token', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  { type: 'function', name: 'claim', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'amount', type: 'uint256' }] },
  {
    type: 'function',
    name: 'claimToken',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
] as const
