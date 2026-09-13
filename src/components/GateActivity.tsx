import { useEffect, useState } from "react";
import { getGateOperations } from "../services/gateService";
import { RealtimeEvents } from "../services/realtimeService";
import { useSocketEvent } from "../hooks/useRealtime";
import { Gate, GateOperation, OperationSource } from "../types/gate";

interface Props {
  gate: Gate;
  onClose: () => void;
}

const sourceLabel: Record<OperationSource, string> = {
  manual: "Obsluha",
  system: "Systém",
};

const actionLabel: Record<GateOperation["action"], string> = {
  open: "Otevřít",
  close: "Zavřít",
  toggle: "Přepnout",
};

export default function GateActivity({ gate, onClose }: Props) {
  const [operations, setOperations] = useState<GateOperation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const ops = await getGateOperations(gate._id);
        if (alive) setOperations(ops);
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

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-sm text-text-secondary">Načítání…</div>
          ) : (
            <OperationsList operations={operations} />
          )}
        </div>
      </div>
    </div>
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

function SourceBadge({ source }: { source: OperationSource }) {
  const cls = source === "manual" ? "bg-link" : "bg-secondary";
  const text = source === "system" ? "text-text-primary" : "text-white";
  return <span className={`px-1.5 py-0.5 rounded text-xs ${cls} ${text}`}>{sourceLabel[source]}</span>;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("cs-CZ");
}
