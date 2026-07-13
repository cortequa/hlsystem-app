import { useCallback, useEffect, useMemo, useState } from "react";
import { orderService } from "../services/orderService";
import { visitorService } from "../services/visitorService";
import { licensePlateService } from "../services/licensePlateService";
import { Order } from "../types/order";
import { Visitor } from "../types/visitor";
import { LicensePlate } from "../types/licensePlate";
import ReservationModal, { ReservationAggregate } from "../components/ReservationModal";

export default function Reservations() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [plates, setPlates] = useState<LicensePlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; reservation: ReservationAggregate | null }>({
    open: false,
    reservation: null,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ord, vis, wl] = await Promise.all([
        orderService.getOrders(),
        visitorService.getVisitors(),
        licensePlateService.getWhitelist().catch(() => [] as LicensePlate[]),
      ]);
      setOrders(ord);
      setVisitors(vis);
      setPlates(wl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Načtení rezervací selhalo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visitorMap = useMemo(() => new Map(visitors.map((v) => [v._id, v])), [visitors]);
  const platesByOrder = useMemo(() => {
    const m = new Map<string, LicensePlate[]>();
    for (const p of plates) {
      if (!p.order) continue;
      const arr = m.get(p.order) ?? [];
      arr.push(p);
      m.set(p.order, arr);
    }
    return m;
  }, [plates]);

  const visitorName = (order: Order): string => {
    const v = order.visitor;
    if (!v) return "—";
    if (typeof v === "object") return v.name;
    return visitorMap.get(v)?.name ?? "—";
  };

  const cancel = async (order: Order) => {
    try {
      const linked = platesByOrder.get(order._id) ?? [];
      await Promise.all(linked.map((p) => licensePlateService.remove(p._id)));
      await orderService.deleteOrder(order._id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zrušení selhalo.");
    }
  };

  const openEdit = (order: Order) =>
    setModal({ open: true, reservation: { order, plates: platesByOrder.get(order._id) ?? [] } });

  return (
    <div className="h-full overflow-y-auto p-6 bg-primary">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-text-primary">Rezervace</h1>
        <button
          onClick={() => setModal({ open: true, reservation: null })}
          className="bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm"
        >
          + Nová rezervace
        </button>
      </div>

      {error && <div className="mb-4 text-error text-sm">{error}</div>}

      {loading ? (
        <div className="text-sm text-text-secondary">Načítání…</div>
      ) : orders.length === 0 ? (
        <div className="text-sm text-text-secondary">Žádné rezervace.</div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const linked = platesByOrder.get(order._id) ?? [];
            return (
              <div key={order._id} className="bg-secondary/30 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-text-primary">{visitorName(order)}</span>
                    {(() => {
                      const froms = linked.map((p) => p.from).filter(Boolean) as string[];
                      const tos = linked.map((p) => p.to).filter(Boolean) as string[];
                      const from = froms.sort()[0];
                      const to = tos.sort().slice(-1)[0];
                      return (from || to) ? (
                        <span className="text-xs text-text-secondary">
                          {from ? formatDate(from) : "?"} – {to ? formatDate(to) : "?"}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {order.note && (
                    <div className="text-sm text-text-secondary mt-1">{order.note}</div>
                  )}
                  {linked.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {linked.map((p) => (
                        <span key={p._id} className="bg-secondary/60 text-text-primary px-2 py-0.5 rounded-full text-xs font-mono">
                          {p.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => openEdit(order)} className="bg-link text-white px-3 py-1.5 rounded-lg text-sm">
                    Upravit
                  </button>
                  <button onClick={() => cancel(order)} className="bg-error text-white px-3 py-1.5 rounded-lg text-sm">
                    Zrušit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal.open && (
        <ReservationModal
          visitors={visitors}
          reservation={modal.reservation}
          onClose={() => setModal({ open: false, reservation: null })}
          onSaved={() => {
            setModal({ open: false, reservation: null });
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
