import { concatHex, encodeAbiParameters, hashTypedData, keccak256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const account = privateKeyToAccount(
  '0x0123456789012345678901234567890123456789012345678901234567890123',
)

const types = {
  Profile: [
    { name: 'from', type: 'address' },
    { name: 'timestamp', type: 'uint64' },
    { name: 'profile', type: 'string' },
  ],
}
const domain = {
  name: 'snapshot',
  version: '0.1.4',
}
const message = {
  from: account.address,
  timestamp: 1893456000,
  profile: JSON.stringify({ avatar: 'ipfs://bafyexample' }),
}

const domainTypeHash = keccak256(
  new TextEncoder().encode('EIP712Domain(string name,string version)'),
)
const profileTypeHash = keccak256(
  new TextEncoder().encode('Profile(address from,uint64 timestamp,string profile)'),
)
const domainSeparator = keccak256(
  encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [
      domainTypeHash,
      keccak256(new TextEncoder().encode(domain.name)),
      keccak256(new TextEncoder().encode(domain.version)),
    ],
  ),
)
const structHash = keccak256(
  encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint64' }, { type: 'bytes32' }],
    [
      profileTypeHash,
      message.from,
      message.timestamp,
      keccak256(new TextEncoder().encode(message.profile)),
    ],
  ),
)
const solidityDigest = keccak256(concatHex(['0x1901', domainSeparator, structHash]))
const viemDigest = hashTypedData({ domain, types, primaryType: 'Profile', message })

if (solidityDigest !== viemDigest) {
  throw new Error(`EIP-712 digest mismatch: ${solidityDigest} !== ${viemDigest}`)
}

console.log('Snapshot Profile EIP-712 digest check passed.')
