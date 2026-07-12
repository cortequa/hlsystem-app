import { useEffect, useState } from "react";
import { getGateOperations } from "../services/gateService";
import { accessEventService } from "../services/accessEventService";
import { RealtimeEvents } from "../services/realtimeService";
import { useSocketEvent } from "../hooks/useRealtime";
import { Gate, GateOperation, OperationSource } from "../types/gate";
import { AccessEvent } from "../types/accessEvent";

interface Props {
  gate: Gate;
  onClose: () => void;
}

const sourceLabel: Record<OperationSource, string> = {
  manual: "Obsluha",
  lpr: "LPR",
  system: "Systém",
};

const actionLabel: Record<GateOperation["action"], string> = {
  open: "Otevřít",
  close: "Zavřít",
  toggle: "Přepnout",
};

export default function GateActivity({ gate, onClose }: Props) {
  const [operations, setOperations] = useState<GateOperation[]>([]);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [tab, setTab] = useState<"operations" | "events">("operations");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [ops, evs] = await Promise.all([
          getGateOperations(gate._id),
          accessEventService.list(gate._id).catch(() => [] as AccessEvent[]),
        ]);
        if (alive) {
          setOperations(ops);
          setEvents(evs);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [gate._id]);

  // Živě přidávej nové operace pro tuto bránu.
  useSocketEvent<{ gateId: string; action: GateOperation["action"]; source: OperationSource; isOpen: boolean }>(
    RealtimeEvents.gateOperation,
    (d) => {
      if (d.gateId !== gate._id) return;
      setOperations((prev) => [
        {
          _id: `live-${Date.now()}`,
          gateId: d.gateId,
          action: d.action,
          source: d.source,
          resultIsOpen: d.isOpen,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-primary rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-secondary">
          <h2 className="text-lg font-semibold text-text-primary">
            Historie brány — {gate.name}
          </h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-4 pt-3">
          <TabButton active={tab === "operations"} onClick={() => setTab("operations")}>
            Ovládací operace
          </TabButton>
          <TabButton active={tab === "events"} onClick={() => setTab("events")}>
            LPR události
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="text-sm text-text-secondary">Načítání…</div>}

          {!loading && tab === "operations" && (
            <OperationsList operations={operations} />
          )}
          {!loading && tab === "events" && <EventsList events={events} />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-t-lg text-sm font-medium ${
        active ? "bg-secondary text-text-primary" : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function OperationsList({ operations }: { operations: GateOperation[] }) {
  if (operations.length === 0) {
    return <div className="text-sm text-text-secondary">Zatím žádné operace.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {operations.map((op) => (
        <li key={op._id} className="flex items-center justify-between text-sm border-b border-secondary/50 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text-primary">{actionLabel[op.action]}</span>
            <SourceBadge source={op.source} />
            {op.resultIsOpen !== undefined && (
              <span className="text-xs text-text-secondary">
                → {op.resultIsOpen ? "otevřeno" : "zavřeno"}
              </span>
            )}
          </div>
          <span className="text-xs text-text-secondary">{formatTime(op.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function EventsList({ events }: { events: AccessEvent[] }) {
  if (events.length === 0) {
    return <div className="text-sm text-text-secondary">Zatím žádné LPR události.</div>;
  }
  return (
    <ul className="space-y-2">
      {events.map((ev) => (
        <li key={ev._id} className="flex items-center gap-3 text-sm border-b border-secondary/50 pb-2">
          <img
            src={accessEventService.imageUrl(ev._id)}
            alt={ev.plateText}
            className="w-16 h-12 object-cover rounded bg-black"
            loading="lazy"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-text-primary">{ev.plateText}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs text-white ${
                  ev.decision === "allow" ? "bg-success" : "bg-error"
                }`}
              >
                {ev.decision === "allow" ? "povoleno" : "zamítnuto"}
              </span>
              <span className="text-xs text-text-secondary">{ev.direction === "entry" ? "vjezd" : "výjezd"}</span>
            </div>
            <div className="text-xs text-text-secondary">
              {ev.reason} · {(ev.confidence * 100).toFixed(0)} %
            </div>
          </div>
          <span className="text-xs text-text-secondary">{formatTime(ev.occurredAt)}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceBadge({ source }: { source: OperationSource }) {
  const cls =
    source === "manual" ? "bg-link" : source === "lpr" ? "bg-text-secondary" : "bg-secondary";
  const text = source === "system" ? "text-text-primary" : "text-white";
  return <span className={`px-1.5 py-0.5 rounded text-xs ${cls} ${text}`}>{sourceLabel[source]}</span>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("cs-CZ");
}
