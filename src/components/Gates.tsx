import { useCallback, useEffect, useState } from "react";
import { closeGate, getGates, openGate } from "../services/gateService";
import { RealtimeEvents } from "../services/realtimeService";
import { useSocketConnected, useSocketEvent } from "../hooks/useRealtime";
import { Gate, GatePhase } from "../types/gate";
import RTSPStream from "./RTSPStream";
import RTSPDiagnostics from "./RTSPDiagnostics";
import GateActivity from "./GateActivity";

interface LiveState {
  isOpen: boolean;
  phase?: GatePhase; // přechodná fáze pohybu (opening/closing)
}

export default function Gates() {
  const [gates, setGates] = useState<Gate[]>([]);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activityGate, setActivityGate] = useState<Gate | null>(null);
  const connected = useSocketConnected();

  useEffect(() => {
    (async () => {
      try {
        const data = await getGates();
        const valid = data.filter((g) => g && g._id);
        setGates(valid);
        setLive(
          Object.fromEntries(valid.map((g) => [g._id, { isOpen: g.isOpen }])),
        );
      } catch (err) {
        console.error("Error fetching gates:", err);
        setError("Nepodařilo se načíst brány.");
        setGates([]);
      }
    })();
  }, []);

  // --- živý stav přes WebSocket (místo slepého lokálního toggle) ---
  const patch = useCallback((gateId: string, next: Partial<LiveState>) => {
    setLive((prev) => ({ ...prev, [gateId]: { ...prev[gateId], ...next } }));
  }, []);

  useSocketEvent<{ gateId: string }>(RealtimeEvents.gateOpening, (d) =>
    patch(d.gateId, { phase: "opening" }),
  );
  useSocketEvent<{ gateId: string }>(RealtimeEvents.gateClosing, (d) =>
    patch(d.gateId, { phase: "closing" }),
  );
  useSocketEvent<{ gateId: string }>(RealtimeEvents.gateOpened, (d) =>
    patch(d.gateId, { isOpen: true, phase: undefined }),
  );
  useSocketEvent<{ gateId: string }>(RealtimeEvents.gateClosed, (d) =>
    patch(d.gateId, { isOpen: false, phase: undefined }),
  );
  useSocketEvent<{ gateId: string; isOpen: boolean }>(
    RealtimeEvents.gateOperation,
    (d) => patch(d.gateId, { isOpen: d.isOpen }),
  );

  const runCommand = async (
    gateId: string,
    fn: (id: string) => Promise<{ isOpen: boolean }>,
  ) => {
    setBusy((b) => ({ ...b, [gateId]: true }));
    setError(null);
    try {
      const res = await fn(gateId);
      patch(gateId, { isOpen: res.isOpen });
    } catch (err) {
      console.error("Gate command failed:", err);
      setError(err instanceof Error ? err.message : "Příkaz brány selhal.");
    } finally {
      setBusy((b) => ({ ...b, [gateId]: false }));
    }
  };

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => setShowDiagnostics(true)}
          className="bg-link hover:opacity-90 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Diagnostika kamery
        </button>

        <span
          className={`flex items-center gap-1.5 text-xs font-medium ${
            connected ? "text-success" : "text-error"
          }`}
          title={connected ? "Realtime připojeno" : "Realtime odpojeno"}
        >
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-error"}`} />
          {connected ? "živě" : "offline"}
        </span>
      </div>

      {error && <div className="mb-2 text-sm text-error">{error}</div>}

      {gates.length === 0 && (
        <div className="text-sm text-text-secondary">Žádné brány.</div>
      )}

      {gates.map((g) => {
        const s = live[g._id] ?? { isOpen: g.isOpen };
        const moving = s.phase === "opening" || s.phase === "closing";
        return (
          <div key={g._id} className="mb-3 rounded-lg">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">{g.name}</span>
                <StatusPill isOpen={s.isOpen} phase={s.phase} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => runCommand(g._id, openGate)}
                  disabled={busy[g._id] || moving}
                  className="bg-success hover:opacity-90 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
                >
                  Otevřít
                </button>
                <button
                  onClick={() => runCommand(g._id, closeGate)}
                  disabled={busy[g._id] || moving}
                  className="bg-error hover:opacity-90 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
                >
                  Zavřít
                </button>
                <button
                  onClick={() => setActivityGate(g)}
                  className="bg-secondary hover:opacity-90 text-text-primary px-3 py-1.5 rounded-lg text-sm"
                  title="Auditní historie brány"
                >
                  Historie
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="aspect-video w-full rounded-md overflow-hidden bg-black">
                <RTSPStream rtspUrl={g.cameras.entry} streamId={`${g._id}-entry`} className="w-full h-full" />
              </div>
              <div className="aspect-video w-full rounded-md overflow-hidden bg-black">
                <RTSPStream rtspUrl={g.cameras.exit} streamId={`${g._id}-exit`} className="w-full h-full" />
              </div>
            </div>
          </div>
        );
      })}

      <RTSPDiagnostics isOpen={showDiagnostics} onClose={() => setShowDiagnostics(false)} />
      {activityGate && (
        <GateActivity gate={activityGate} onClose={() => setActivityGate(null)} />
      )}
    </div>
  );
}

function StatusPill({ isOpen, phase }: { isOpen: boolean; phase?: GatePhase }) {
  let label = isOpen ? "Otevřeno" : "Zavřeno";
  let cls = isOpen ? "bg-success text-white" : "bg-text-secondary text-white";
  if (phase === "opening") {
    label = "Otevírá se…";
    cls = "bg-link text-white animate-pulse";
  } else if (phase === "closing") {
    label = "Zavírá se…";
    cls = "bg-link text-white animate-pulse";
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}
