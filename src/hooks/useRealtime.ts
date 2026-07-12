import { useEffect, useRef, useState } from "react";
import { getSocket } from "../services/realtimeService";

/** Přihlásí handler na Socket.IO událost po dobu života komponenty. */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const cb = (data: T) => ref.current(data);
    socket.on(event, cb);
    return () => {
      socket.off(event, cb);
    };
  }, [event]);
}

/** Stav připojení socketu (pro indikátor „živě/offline" v UI). */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);

  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  return connected;
}
