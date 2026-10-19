import os from 'node:os';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createQuizServer } from './server';
import { ipv4Candidates, pickHostIp } from './lanIp';

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const port = Number(process.env.PORT) || 3000;
const pin = process.env.ADMIN_PIN || String(randomInt(1000, 10000));
const candidates = ipv4Candidates(os.networkInterfaces());
const joinUrl = `http://${pickHostIp(candidates, process.env.HOST_IP)}:${port}/`;

// Битые игры не мешают запуску: они видны в библиотеке с текстом ошибки.
const server = createQuizServer({
  dataDir: here('../data'),
  statePath: process.env.STATE_PATH || here('../data/state.json'),
  clientDist: here('../../client/dist'),
  pin,
  joinUrl,
});

server.httpServer.listen(port, () => {
  console.log('IPv4-адреса этого компьютера:');
  for (const c of candidates) console.log(`  ${c.iface}: ${c.address}`);
  console.log(process.env.HOST_IP ? 'Адрес задан через HOST_IP.' : 'Не тот адрес? Перезапустите с HOST_IP=<адрес>.');
  console.log(`Игроки:        ${joinUrl}`);
  console.log(`Большой экран: ${joinUrl}screen`);
  console.log(`Ведущий:       ${joinUrl}admin`);
  console.log(`PIN ведущего:  ${pin}`);
});
