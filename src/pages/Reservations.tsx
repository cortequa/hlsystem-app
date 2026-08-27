import { useCallback, useEffect, useMemo, useState } from "react";
import Pagination from "../components/Pagination";
import ReservationModal from "../components/ReservationModal";
import { useDebounced } from "../hooks/useDebounced";
import { usePagedList } from "../hooks/usePagedList";
import { stayService } from "../services/stayService";
import { visitorService } from "../services/visitorService";
import { Stay, StayStatus, stayStatusLabel } from "../types/stay";
import { Visitor, visitorFullName } from "../types/visitor";

type StatusFilter = StayStatus | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "booked", label: "Rezervováno" },
  { value: "checked_in", label: "Na místě" },
  { value: "checked_out", label: "Odjelo" },
  { value: "cancelled", label: "Zrušeno" },
];

const statusClass: Record<StayStatus, string> = {
  booked: "bg-link/15 text-link",
  checked_in: "bg-success/15 text-success",
  checked_out: "bg-secondary/60 text-text-secondary",
  cancelled: "bg-error/15 text-error",
};

export default function Reservations() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [plateSearch, setPlateSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; stay: Stay | null }>({
    open: false,
    stay: null,
  });

  const debouncedPlate = useDebounced(plateSearch);

  // Vozidla přijdou vnořená v pobytu. Dřív se kvůli spárování SPZ
  // s rezervacemi stahoval celý whitelist (strop 20 000) do prohlížeče.
  const {
    items: stays,
    total,
    page,
    limit,
    loading,
    error: listError,
    setPage,
    setLimit,
    reload,
  } = usePagedList<Stay>({
    fetchPage: (currentPage, currentLimit, signal) =>
      stayService.getStaysPage(
        {
          page: currentPage,
          limit: currentLimit,
          ...(status === "all" ? {} : { status }),
          ...(debouncedPlate.trim() ? { plate: debouncedPlate.trim() } : {}),
        },
        signal,
      ),
    filterKey: [status, debouncedPlate],
    initialLimit: 25,
  });

  // Návštěvníci slouží jen jako číselník pro zobrazení jména a našeptávač
  // ve formuláři. Kolekce je řádově menší než pobyty.
  useEffect(() => {
    let active = true;
    visitorService
      .getVisitors()
      .then((list) => {
        if (active) setVisitors(list);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Načtení hostů selhalo.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setError(null);
    reload();
  }, [reload]);

  const visitorMap = useMemo(
    () => new Map(visitors.map((v) => [v._id, v])),
    [visitors],
  );

  /**
   * Zrušení pobytu je jedno volání. Původní verze mazala SPZ po jedné
   * z prohlížeče a pak teprve rezervaci — když selhala v půlce, SPZ zůstala
   * ve whitelistu a auto projelo i po zrušené rezervaci.
   */
  const runAction = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-primary">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-text-primary">Rezervace</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={plateSearch}
            onChange={(e) => setPlateSearch(e.target.value)}
            placeholder="Hledat podle SPZ…"
            className="px-3 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="px-3 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setModal({ open: true, stay: null })}
            className="bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm"
          >
            + Nová rezervace
          </button>
        </div>
      </div>

      {(error ?? listError) && (
        <div className="mb-4 text-error text-sm">{error ?? listError}</div>
      )}

      {loading ? (
        <div className="text-sm text-text-secondary">Načítání…</div>
      ) : stays.length === 0 ? (
        <div className="text-sm text-text-secondary">Žádné rezervace.</div>
      ) : (
        <div className="space-y-2">
          {stays.map((stay) => (
            <div key={stay._id} className="bg-secondary/30 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-text-primary">
                    {visitorFullName(visitorMap.get(stay.visitorId))}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {formatDate(stay.from)} – {formatDate(stay.to)}
                    <span className="ml-1 opacity-70">({stay.nights} nocí)</span>
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[stay.status]}`}>
                    {stayStatusLabel[stay.status]}
                  </span>
                </div>
                {stay.note && (
                  <div className="text-sm text-text-secondary mt-1">{stay.note}</div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {stay.vehicles.length === 0 ? (
                    <span className="text-xs text-text-secondary italic">
                      Bez SPZ — brána auto nepustí
                    </span>
                  ) : (
                    stay.vehicles.map((v) => (
                      <span key={v.plateNormalized} className="bg-secondary/60 text-text-primary px-2 py-0.5 rounded-full text-xs font-mono">
                        {v.plate}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                {stay.status === "booked" && (
                  <button
                    onClick={() => void runAction(() => stayService.checkIn(stay._id), "Check-in selhal.")}
                    className="bg-success text-white px-3 py-1.5 rounded-lg text-sm"
                  >
                    Check-in
                  </button>
                )}
                {stay.status === "checked_in" && (
                  <button
                    onClick={() => void runAction(() => stayService.checkOut(stay._id), "Check-out selhal.")}
                    className="bg-secondary text-text-primary px-3 py-1.5 rounded-lg text-sm"
                  >
                    Check-out
                  </button>
                )}
                <button onClick={() => setModal({ open: true, stay })} className="bg-link text-white px-3 py-1.5 rounded-lg text-sm">
                  Upravit
                </button>
                {stay.status !== "cancelled" && (
                  <button
                    onClick={() => void runAction(() => stayService.cancel(stay._id), "Zrušení selhalo.")}
                    className="bg-error text-white px-3 py-1.5 rounded-lg text-sm"
                  >
                    Zrušit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!listError && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          loading={loading}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      )}

      {modal.open && (
        <ReservationModal
          visitors={visitors}
          stay={modal.stay}
          onClose={() => setModal({ open: false, stay: null })}
          onSaved={() => {
            setModal({ open: false, stay: null });
            refresh();
          }}
        />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("cs-CZ");
}
