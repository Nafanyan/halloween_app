import { describe, it, expect } from 'vitest';
import type { NetworkInterfaceInfo } from 'node:os';
import { ipv4Candidates, pickHostIp } from '../src/lanIp';

const v4 = (address: string, internal = false) =>
  ({ family: 'IPv4', address, internal, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;
const v6 = (address: string) =>
  ({ family: 'IPv6', address, internal: false, netmask: '', mac: '', cidr: null, scopeid: 0 }) as NetworkInterfaceInfo;

describe('lan ip', () => {
  const ifaces = { lo0: [v4('127.0.0.1', true)], bridge100: [v4('192.168.64.1')], en0: [v6('fe80::1'), v4('192.168.1.20')] };

  it('lists non-internal IPv4 with interface names', () => {
    expect(ipv4Candidates(ifaces)).toEqual([
      { iface: 'bridge100', address: '192.168.64.1' },
      { iface: 'en0', address: '192.168.1.20' },
    ]);
  });

  it('prefers HOST_IP, then en0, then first candidate', () => {
    const c = ipv4Candidates(ifaces);
    expect(pickHostIp(c, '10.0.0.5')).toBe('10.0.0.5');
    expect(pickHostIp(c)).toBe('192.168.1.20');
    expect(pickHostIp(c.filter((x) => x.iface !== 'en0'))).toBe('192.168.64.1');
    expect(pickHostIp([])).toBe('localhost');
  });
});
