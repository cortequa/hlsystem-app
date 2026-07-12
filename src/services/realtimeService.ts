import { io, Socket } from "socket.io-client";
import { ENV } from "../config/env";

/**
 * Sdílené Socket.IO připojení k core API (Sprint 4). Core už vysílá události
 * `gateOpening/gateClosing/gateOpened/gateClosed`, `gateOperation`, `accessEvent`
 * a `licensePlateUploaded` — app na ně poslouchá místo slepého lokálního stavu.
 */

export const RealtimeEvents = {
  gateOpening: "gateOpening",
  gateClosing: "gateClosing",
  gateOpened: "gateOpened",
  gateClosed: "gateClosed",
  gateOperation: "gateOperation",
  accessEvent: "accessEvent",
  licensePlateUploaded: "licensePlateUploaded",
} as const;

let socket: Socket | null = null;

/** Vrací (a při první potřebě vytvoří) sdílený socket. */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(ENV.API.WS, {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}
