import type { NetworkInterfaceInfo } from 'node:os';

export interface IpCandidate { iface: string; address: string }

type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

/** All non-internal IPv4 addresses with their interface names. */
export function ipv4Candidates(ifaces: Interfaces): IpCandidate[] {
  const out: IpCandidate[] = [];
  for (const [iface, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) if (a.family === 'IPv4' && !a.internal) out.push({ iface, address: a.address });
  }
  return out;
}

/** HOST_IP override, else en0 (Mac Wi-Fi), else first candidate, else localhost. */
export function pickHostIp(candidates: IpCandidate[], hostIp?: string): string {
  if (hostIp) return hostIp;
  return (candidates.find((c) => c.iface === 'en0') ?? candidates[0])?.address ?? 'localhost';
}
