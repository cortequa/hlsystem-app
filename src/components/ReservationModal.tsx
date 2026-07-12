import { FormEvent, useMemo, useState } from "react";
import { orderService } from "../services/orderService";
import { visitorService } from "../services/visitorService";
import { licensePlateService } from "../services/licensePlateService";
import { Product } from "../types/product";
import { Visitor } from "../types/visitor";
import { LicensePlate } from "../types/licensePlate";
import { Order } from "../types/order";

export interface ReservationAggregate {
  order: Order;
  plates: LicensePlate[];
}

interface Props {
  visitors: Visitor[];
  products: Product[];
  reservation: ReservationAggregate | null; // null = nová
  onClose: () => void;
  onSaved: () => void;
}

interface ItemRow {
  productId: string;
  quantity: number;
  duration?: number;
}

const todayISODate = () => new Date().toISOString().split("T")[0];

export default function ReservationModal({ visitors, products, reservation, onClose, onSaved }: Props) {
  const editing = reservation !== null;

  const [visitorMode, setVisitorMode] = useState<"existing" | "new">(
    editing ? "existing" : visitors.length > 0 ? "existing" : "new",
  );
  const [visitorId, setVisitorId] = useState<string>(
    typeof reservation?.order.visitor === "object"
      ? (reservation?.order.visitor as Visitor)._id
      : (reservation?.order.visitor as string) ?? "",
  );
  const [newVisitor, setNewVisitor] = useState({ name: "", email: "", phone: "" });

  const [date, setDate] = useState<string>(
    reservation?.order.createdAt ? reservation.order.createdAt.split("T")[0] : todayISODate(),
  );

  const [items, setItems] = useState<ItemRow[]>(() => {
    if (reservation?.order.items?.length) {
      return reservation.order.items.map((it) => ({
        productId: typeof it.product === "string" ? it.product : it.product._id,
        quantity: it.quantity,
        duration: it.duration,
      }));
    }
    return [{ productId: products[0]?._id ?? "", quantity: 1 }];
  });

  const [plateText, setPlateText] = useState("");
  const [plates, setPlates] = useState<string[]>(reservation?.plates.map((p) => p.text) ?? []);

  const initialTerm = useMemo(() => deriveTerm(reservation?.plates ?? []), [reservation]);
  const [from, setFrom] = useState(initialTerm.from);
  const [to, setTo] = useState(initialTerm.to);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () =>
    setItems((prev) => [...prev, { productId: products[0]?._id ?? "", quantity: 1 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const patchItem = (i: number, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const addPlate = () => {
    const t = plateText.trim().toUpperCase();
    if (t && !plates.includes(t)) setPlates((prev) => [...prev, t]);
    setPlateText("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const validItems = items.filter((it) => it.productId && it.quantity > 0);
    if (validItems.length === 0) {
      setError("Přidej alespoň jednu položku.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Návštěvník: existující nebo rychlé založení.
      let resolvedVisitorId = visitorId;
      if (visitorMode === "new") {
        if (!newVisitor.name || !newVisitor.email) {
          throw new Error("Nový návštěvník potřebuje jméno a e-mail.");
        }
        const created = await visitorService.createVisitor(newVisitor);
        resolvedVisitorId = created.visitorId;
      }

      const orderPayload = {
        visitorId: resolvedVisitorId || undefined,
        products: validItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          duration: it.duration,
        })),
        date: new Date(date).toISOString(),
      };

      // 2) Objednávka (rezervace) — create nebo update.
      let orderId: string;
      if (editing && reservation) {
        await orderService.updateOrder(reservation.order._id, orderPayload);
        orderId = reservation.order._id;
      } else {
        orderId = await orderService.createOrder(orderPayload);
      }

      // 3) SPZ pro pobyt: bez update endpointu smažeme staré a založíme aktuální.
      if (editing && reservation) {
        await Promise.all(reservation.plates.map((p) => licensePlateService.remove(p._id)));
      }
      const fromISO = from ? new Date(from).toISOString() : undefined;
      const toISO = to ? new Date(to).toISOString() : undefined;
      await Promise.all(
        plates.map((text) =>
          licensePlateService.create(text, { order: orderId, from: fromISO, to: toISO }),
        ),
      );

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení rezervace selhalo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-primary rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-secondary">
          <h2 className="text-lg font-semibold text-text-primary">
            {editing ? "Upravit rezervaci" : "Nová rezervace"}
          </h2>
          <button type="button" onClick={onClose} className="text-text-secondary hover:text-text-primary text-xl leading-none">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Návštěvník */}
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">Návštěvník</h3>
            <div className="flex gap-2 mb-2 text-sm">
              <button
                type="button"
                onClick={() => setVisitorMode("existing")}
                className={`px-3 py-1 rounded-lg ${visitorMode === "existing" ? "bg-link text-white" : "bg-secondary text-text-primary"}`}
              >
                Existující
              </button>
              <button
                type="button"
                onClick={() => setVisitorMode("new")}
                className={`px-3 py-1 rounded-lg ${visitorMode === "new" ? "bg-link text-white" : "bg-secondary text-text-primary"}`}
              >
                Nový
              </button>
            </div>
            {visitorMode === "existing" ? (
              <select
                value={visitorId}
                onChange={(e) => setVisitorId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary"
              >
                <option value="">— vyber návštěvníka —</option>
                {visitors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name} ({v.email})
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Jméno" value={newVisitor.name} onChange={(e) => setNewVisitor({ ...newVisitor, name: e.target.value })} className="px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary" />
                <input placeholder="E-mail" value={newVisitor.email} onChange={(e) => setNewVisitor({ ...newVisitor, email: e.target.value })} className="px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary" />
                <input placeholder="Telefon" value={newVisitor.phone} onChange={(e) => setNewVisitor({ ...newVisitor, phone: e.target.value })} className="px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary" />
              </div>
            )}
          </section>

          {/* Termín */}
          <section className="grid grid-cols-3 gap-2">
            <label className="text-xs text-text-secondary">
              Datum rezervace
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary" />
            </label>
            <label className="text-xs text-text-secondary">
              Pobyt od
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary" />
            </label>
            <label className="text-xs text-text-secondary">
              Pobyt do
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary" />
            </label>
          </section>

          {/* Položky */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-primary">Položky</h3>
              <button type="button" onClick={addItem} className="text-link text-sm hover:underline">
                + přidat položku
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={it.productId}
                    onChange={(e) => patchItem(i, { productId: e.target.value })}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
                  >
                    {products.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.price} Kč)
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={it.quantity}
                    onChange={(e) => patchItem(i, { quantity: Number(e.target.value) })}
                    className="w-16 px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
                    title="Počet"
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="noci"
                    value={it.duration ?? ""}
                    onChange={(e) => patchItem(i, { duration: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-20 px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
                    title="Délka (noci)"
                  />
                  <button type="button" onClick={() => removeItem(i)} className="text-error text-sm px-1" title="Odebrat">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* SPZ */}
          <section>
            <h3 className="text-sm font-semibold text-text-primary mb-2">SPZ pobytu (whitelist v termínu)</h3>
            <div className="flex gap-2 mb-2">
              <input
                value={plateText}
                onChange={(e) => setPlateText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPlate();
                  }
                }}
                placeholder="SPZ"
                className="flex-1 px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase text-sm"
              />
              <button type="button" onClick={addPlate} className="bg-secondary text-text-primary px-3 py-2 rounded-lg text-sm">
                Přidat
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {plates.map((t) => (
                <span key={t} className="flex items-center gap-1 bg-secondary/60 text-text-primary px-2 py-1 rounded-full text-xs font-mono">
                  {t}
                  <button type="button" onClick={() => setPlates((prev) => prev.filter((x) => x !== t))} className="text-error">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          </section>

          {error && <div className="text-error text-sm">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-secondary">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-secondary text-text-primary">
            Zrušit
          </button>
          <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm bg-success text-white disabled:opacity-50">
            {submitting ? "Ukládám…" : editing ? "Uložit změny" : "Vytvořit rezervaci"}
          </button>
        </div>
      </form>
    </div>
  );
}

function deriveTerm(plates: LicensePlate[]): { from: string; to: string } {
  const froms = plates.map((p) => p.from).filter(Boolean) as string[];
  const tos = plates.map((p) => p.to).filter(Boolean) as string[];
  const min = froms.sort()[0];
  const max = tos.sort().slice(-1)[0];
  return {
    from: min ? min.split("T")[0] : "",
    to: max ? max.split("T")[0] : "",
  };
}
