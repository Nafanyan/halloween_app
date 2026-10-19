import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { AdminView, ClientToServerEvents, PublicView, PurchasedEvent, ServerToClientEvents, Trophy } from '@quiz/shared';
import { loadPlayerId } from './player/playerId';
import { dequeue, enqueue } from './shop/queue';

// Identity goes in the handshake (read at each connect) so a buzz buffered while offline
// is attributed on reconnect before player:resume runs. Only the player page is a player.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  auth: (cb) => cb({ playerId: window.location.pathname === '/' ? loadPlayerId() : null }),
});

let lastPublic: PublicView | null = null;
let lastAdmin: AdminView | null = null;
socket.on('state:public', (v) => { lastPublic = v; });
socket.on('state:admin', (v) => { lastAdmin = v; });
let lastTrophies: Trophy[] = [];
socket.on('player:trophies', (t) => { lastTrophies = t; });

export function usePublicView(): PublicView | null {
  const [view, setView] = useState<PublicView | null>(lastPublic);
  useEffect(() => {
    socket.on('state:public', setView);
    return () => {
      socket.off('state:public', setView);
    };
  }, []);
  return view;
}

export function useAdminView(): AdminView | null {
  const [view, setView] = useState<AdminView | null>(lastAdmin);
  useEffect(() => {
    socket.on('state:admin', setView);
    return () => {
      socket.off('state:admin', setView);
    };
  }, []);
  return view;
}

export function useConnected(): boolean {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const up = () => setConnected(true);
    const down = () => setConnected(false);
    socket.on('connect', up);
    socket.on('disconnect', down);
    setConnected(socket.connected);
    return () => {
      socket.off('connect', up);
      socket.off('disconnect', down);
    };
  }, []);
  return connected;
}

export function useTrophies(): Trophy[] {
  const [t, setT] = useState<Trophy[]>(lastTrophies);
  useEffect(() => {
    socket.on('player:trophies', setT);
    return () => {
      socket.off('player:trophies', setT);
    };
  }, []);
  return t;
}

export function usePurchaseQueue(): { current: PurchasedEvent | null; done: () => void } {
  const [queue, setQueue] = useState<PurchasedEvent[]>([]);
  useEffect(() => {
    const on = (e: PurchasedEvent) => setQueue((q) => enqueue(q, e));
    socket.on('shop:purchased', on);
    return () => {
      socket.off('shop:purchased', on);
    };
  }, []);
  const done = useCallback(() => setQueue(dequeue), []);
  return { current: queue[0] ?? null, done };
}
