import { useCallback, useEffect, useState } from "react";
import { useSocketEvent } from "../hooks/useRealtime";
import { accessEventService } from "../services/accessEventService";
import { pendingArrivalService } from "../services/pendingArrivalService";
import { RealtimeEvents } from "../services/realtimeService";
import { stayService } from "../services/stayService";
import { accessReasonLabel, AccessReason } from "../types/licensePlate";
import { PendingArrival, PendingArrivalEvent } from "../types/pendingArrival";
import { Stay } from "../types/stay";

interface Props {
  /** Předá SPZ do košíku — obsluha ji nemusí opisovat ze snímku. */
  onSellTicket: (arrival: PendingArrival) => void;
}

const reasonText = (reason: string): string =>
  accessReasonLabel[reason as AccessReason] ?? reason;

/**
 * Fronta aut, která stojí u brány a systém je nepustil.
 *
 * Dokud tohle neexistovalo, bylo zamítnutí slepá ulička — skončilo v logu
 * a obsluha na recepci o autě za závorou nevěděla. Karta ukáže snímek, SPZ
 * a důvod, a nabídne tři cesty ven: prodat lístek, pustit jednorázově, nebo
 * SPZ přiřadit k rezervaci, u které chybí.
 */
export default function PendingArrivals({ onSellTicket }: Props) {
  const [arrivals, setArrivals] = useState<PendingArrival[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<PendingArrival | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    pendingArrivalService
      .list(undefined, undefined, signal)
      .then(setArrivals)
      .catch((err: unknown) => {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Načtení fronty selhalo.");
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Nová karta přijde push. Znovunačtení ze serveru místo skládání záznamu
  // z payloadu — událost nenese všechna pole a rozcházející se tvar by se
  // projevil až prázdným snímkem na kartě.
  useSocketEvent<PendingArrivalEvent>(RealtimeEvents.pendingArrival, () => load());
  useSocketEvent<{ pendingArrivalId: string }>(
    RealtimeEvents.pendingArrivalResolved,
    (d) => {
      // Vyřídila jiná pokladna — zmizí i tady, bez dalšího dotazu.
      setArrivals((prev) => prev.filter((a) => a._id !== d.pendingArrivalId));
    },
  );

  const run = async (id: string, action: () => Promise<unknown>, failure: string) => {
    setBusy((prev) => ({ ...prev, [id]: true }));
    setError(null);
    try {
      await action();
      setArrivals((prev) => prev.filter((a) => a._id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  if (arrivals.length === 0 && !error) return null;

  return (
    <div className="bg-secondary/30 rounded-xl p-3 space-y-2">
      <h3 className="font-semibold text-text-primary text-sm">
        Auta čekají u brány{" "}
        <span className="text-text-secondary">({arrivals.length})</span>
      </h3>

      {error && <div className="text-error text-xs">{error}</div>}

      {arrivals.map((arrival) => (
        <div key={arrival._id} className="bg-primary rounded-lg p-2 flex gap-3">
          <img
            src={accessEventService.imageUrl(arrival.accessEventId)}
            alt={`Snímek ${arrival.plateText}`}
            className="w-28 h-20 object-cover rounded-md bg-secondary shrink-0"
          />
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-text-primary">
                  {arrival.plateText}
                </span>
                <span className="text-xs text-text-secondary">
                  {Math.round(arrival.confidence * 100)} %
                </span>
                <span className="text-xs text-text-secondary">
                  {arrival.direction === "entry" ? "vjezd" : "výjezd"}
                </span>
              </div>
              <div className="text-xs text-text-secondary mt-0.5">
                {reasonText(arrival.reason)}
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <button
                disabled={busy[arrival._id]}
                onClick={() => onSellTicket(arrival)}
                className="bg-success text-white px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                Prodat lístek
              </button>
              <button
                disabled={busy[arrival._id]}
                onClick={() =>
                  void run(
                    arrival._id,
                    () => pendingArrivalService.grant(arrival._id),
                    "Otevření brány selhalo.",
                  )
                }
                className="bg-link text-white px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                Pustit jednorázově
              </button>
              <button
                disabled={busy[arrival._id]}
                onClick={() => setLinking(arrival)}
                className="bg-secondary text-text-primary px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                K rezervaci
              </button>
              <button
                disabled={busy[arrival._id]}
                onClick={() =>
                  void run(
                    arrival._id,
                    () => pendingArrivalService.dismiss(arrival._id),
                    "Zavření karty selhalo.",
                  )
                }
                className="text-text-secondary px-2 py-1 rounded text-xs disabled:opacity-50"
              >
                Ignorovat
              </button>
            </div>
          </div>
        </div>
      ))}

      {linking && (
        <LinkToStayModal
          arrival={linking}
          onClose={() => setLinking(null)}
          onLinked={(id) => {
            setLinking(null);
            setArrivals((prev) => prev.filter((a) => a._id !== id));
          }}
        />
      )}
    </div>
  );
}

/**
 * Přiřazení čekající SPZ k rezervaci. Případ z provozu: host rezervoval
 * předem, SPZ neuvedl, a teď stojí u závory. Fuzzy kandidát z rozhodovacího
 * řetězce se nabídne první.
 */
function LinkToStayModal({
  arrival,
  onClose,
  onLinked,
}: {
  arrival: PendingArrival;
  onClose: () => void;
  onLinked: (arrivalId: string) => void;
}) {
  const [stays, setStays] = useState<Stay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    // Aktivní pobyty na dnešek — mezi nimi ten host skoro jistě je.
    const now = new Date().toISOString();
    stayService
      .getStaysPage({ page: 1, limit: 50, from: now, to: now }, controller.signal)
      .then((paged) => setStays(paged.items))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Načtení rezervací selhalo.");
      });
    return () => controller.abort();
  }, []);

  const link = async (stayId: string) => {
    setBusy(true);
    setError(null);
    try {
      await pendingArrivalService.link(arrival._id, stayId);
      onLinked(arrival._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přiřazení selhalo.");
      setBusy(false);
    }
  };

  // Navržený kandidát nahoru, ať ho obsluha nehledá v seznamu.
  const ordered = arrival.suggestedStayId
    ? [
        ...stays.filter((s) => s._id === arrival.suggestedStayId),
        ...stays.filter((s) => s._id !== arrival.suggestedStayId),
      ]
    : stays;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-primary rounded-xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-secondary">
          <h3 className="font-semibold text-text-primary">
            Přiřadit <span className="font-mono">{arrival.plateText}</span> k rezervaci
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {error && <div className="text-error text-sm">{error}</div>}
          {ordered.length === 0 ? (
            <div className="text-sm text-text-secondary">
              Žádné rezervace platné pro dnešek.
            </div>
          ) : (
            ordered.map((stay) => (
              <button
                key={stay._id}
                disabled={busy}
                onClick={() => void link(stay._id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm disabled:opacity-50 ${
                  stay._id === arrival.suggestedStayId
                    ? "bg-link/15 border border-link/40"
                    : "bg-secondary/40 hover:bg-secondary/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-primary">
                    {new Date(stay.from).toLocaleDateString("cs-CZ")} –{" "}
                    {new Date(stay.to).toLocaleDateString("cs-CZ")}
                  </span>
                  {stay._id === arrival.suggestedStayId && (
                    <span className="text-xs text-link">navrženo</span>
                  )}
                </div>
                <div className="text-xs text-text-secondary font-mono mt-0.5">
                  {stay.vehicles.length > 0
                    ? stay.vehicles.map((v) => v.plate).join(", ")
                    : "bez SPZ"}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-secondary flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-secondary text-text-primary">
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}
