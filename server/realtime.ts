import crypto from 'node:crypto';
import type http from 'node:http';
import type { Request } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import {
  resolveAdminFromRequest,
  resolveUserFromRequest,
  verifyFirebaseAdminToken,
} from './auth';
import { db, type DatabaseChangeEvent } from './db';
import { hashReceiptToken, sanitizeText, timingSafeEqualHex } from './security';
import type { RealtimeArea, RealtimeEventMessage } from '../src/shared/types';

interface SubscriberClient {
  ws: WebSocket;
  clientId: string;
  role: 'admin' | 'reseller' | 'guest';
  userId?: string;
  resellerId?: string;
  receiptTokenHash?: string;
  isAlive: boolean;
}

const PUBLIC_AREAS = new Set<RealtimeArea>([
  'storefront',
  'products',
  'categories',
  'discounts',
  'cms',
  'payment_settings',
]);

function filterAreasForSubscriber(
  sub: SubscriberClient,
  event: DatabaseChangeEvent
): RealtimeArea[] {
  if (sub.role === 'admin') {
    return event.areas;
  }

  const allowed: RealtimeArea[] = [];
  const matchesResellerTarget =
    sub.role === 'reseller' &&
    Boolean(
      (event.targetUserId && event.targetUserId === sub.userId) ||
        (event.targetResellerId && event.targetResellerId === sub.resellerId)
    );
  const matchesReceiptTarget =
    Boolean(sub.receiptTokenHash && event.receiptTokenHash) &&
    timingSafeEqualHex(sub.receiptTokenHash!, event.receiptTokenHash!);

  for (const area of event.areas) {
    if (PUBLIC_AREAS.has(area)) {
      allowed.push(area);
      continue;
    }
    if (
      matchesResellerTarget &&
      (area === 'orders' ||
        area === 'payments' ||
        area === 'reseller_wallet' ||
        area === 'topups' ||
        area === 'resellers')
    ) {
      allowed.push(area);
      continue;
    }
    if (matchesReceiptTarget && (area === 'orders' || area === 'payments')) {
      allowed.push(area);
    }
  }

  return allowed;
}

function sendJson(ws: WebSocket, msg: RealtimeEventMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function attachRealtimeServer(httpServer: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const subscribers = new Set<SubscriberClient>();

  const unsubscribeDb = db.subscribeChanges((event) => {
    for (const sub of subscribers) {
      if (sub.ws.readyState !== WebSocket.OPEN) continue;
      const areas = filterAreasForSubscriber(sub, event);
      if (areas.length === 0) continue;
      sendJson(sub.ws, {
        type: 'invalidate',
        areas,
        stateVersion: event.stateVersion,
        timestamp: event.timestamp,
        summary: sub.role === 'admin' ? event.summary : undefined,
      });
    }
  });

  const heartbeatInterval = setInterval(() => {
    for (const sub of subscribers) {
      if (!sub.isAlive) {
        sub.ws.terminate();
        subscribers.delete(sub);
        continue;
      }
      sub.isAlive = false;
      if (sub.ws.readyState === WebSocket.OPEN) {
        sub.ws.ping();
      }
    }
  }, 25_000);
  heartbeatInterval.unref();

  httpServer.on('close', () => {
    clearInterval(heartbeatInterval);
    unsubscribeDb();
    for (const sub of subscribers) {
      try {
        sub.ws.close();
      } catch {
        // ignore close errors during shutdown
      }
    }
    subscribers.clear();
  });

  httpServer.on('upgrade', async (req, socket, head) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      return;
    }

    if (parsedUrl.pathname !== '/ws') {
      return;
    }

    try {
      const pseudoReq = {
        headers: req.headers,
      } as Request;

      const admin = await resolveAdminFromRequest(pseudoReq);
      const user = admin ? null : await resolveUserFromRequest(pseudoReq);

      let receiptTokenHash: string | undefined;
      const rawReceiptToken = sanitizeText(parsedUrl.searchParams.get('receiptToken') || '', 200);
      if (rawReceiptToken) {
        const candidateHash = hashReceiptToken(rawReceiptToken);
        const snap = db.getSnapshot();
        const activeOrder = snap.orders.find(
          (o) => o.receiptActive && timingSafeEqualHex(o.receiptTokenHash, candidateHash)
        );
        if (activeOrder) {
          receiptTokenHash = candidateHash;
        }
      }

      const role: SubscriberClient['role'] = admin
        ? 'admin'
        : user && user.role === 'reseller' && user.resellerStatus === 'active'
          ? 'reseller'
          : 'guest';

      wss.handleUpgrade(req, socket, head, (ws) => {
        const client: SubscriberClient = {
          ws,
          clientId: `ws-${crypto.randomUUID().slice(0, 8)}`,
          role,
          userId: user?.id,
          resellerId: user?.resellerId,
          receiptTokenHash,
          isAlive: true,
        };
        subscribers.add(client);

        const snap = db.getSnapshot();
        sendJson(ws, {
          type: 'connected',
          clientId: client.clientId,
          role: client.role,
          stateVersion: snap.stateVersion || 1,
          timestamp: new Date().toISOString(),
        });

        ws.on('pong', () => {
          client.isAlive = true;
        });

        ws.on('message', async (raw) => {
          try {
            const text = typeof raw === 'string' ? raw : raw.toString('utf8');
            const parsed = JSON.parse(text) as { type?: string; token?: string };
            if (parsed?.type === 'ping') {
              client.isAlive = true;
              sendJson(ws, { type: 'pong', timestamp: new Date().toISOString() });
              return;
            }
            if (parsed?.type === 'auth' && typeof parsed.token === 'string' && parsed.token.trim()) {
              const verified = await verifyFirebaseAdminToken(parsed.token.trim());
              if (verified.ok) {
                client.role = 'admin';
                const currentSnap = db.getSnapshot();
                sendJson(ws, {
                  type: 'connected',
                  clientId: client.clientId,
                  role: client.role,
                  stateVersion: currentSnap.stateVersion || 1,
                  timestamp: new Date().toISOString(),
                });
              }
            }
          } catch {
            // ignore malformed client messages
          }
        });

        ws.on('close', () => {
          subscribers.delete(client);
        });

        ws.on('error', () => {
          subscribers.delete(client);
        });
      });
    } catch {
      socket.destroy();
    }
  });

  return wss;
}
