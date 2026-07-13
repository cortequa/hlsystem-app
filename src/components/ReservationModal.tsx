import { FormEvent, useMemo, useState } from "react";
import { orderService } from "../services/orderService";
import { visitorService } from "../services/visitorService";
import { licensePlateService } from "../services/licensePlateService";
import { Visitor } from "../types/visitor";
import { LicensePlate } from "../types/licensePlate";
import { Order } from "../types/order";

export interface ReservationAggregate {
  order: Order;
  plates: LicensePlate[];
}

interface Props {
  visitors: Visitor[];
  reservation: ReservationAggregate | null; // null = nová
  onClose: () => void;
  onSaved: () => void;
}

const todayISODate = () => new Date().toISOString().split("T")[0];

export default function ReservationModal({ visitors, reservation, onClose, onSaved }: Props) {
  const editing = reservation !== null;

  const initialName = (() => {
    const v = reservation?.order.visitor;
    if (!v) return "";
    if (typeof v === "object") return v.name;
    return visitors.find((x) => x._id === v)?.name ?? "";
  })();

  const [name, setName] = useState(initialName);
  const [note, setNote] = useState<string>(reservation?.order.note ?? "");
  const [plateText, setPlateText] = useState("");
  const [plates, setPlates] = useState<string[]>(reservation?.plates.map((p) => p.text) ?? []);

  const initialTerm = useMemo(() => deriveTerm(reservation?.plates ?? []), [reservation]);
  const [from, setFrom] = useState(initialTerm.from);
  const [to, setTo] = useState(initialTerm.to);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlate = () => {
    const t = plateText.trim().toUpperCase();
    if (t && !plates.includes(t)) setPlates((prev) => [...prev, t]);
    setPlateText("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Zadej jméno hosta.");
      return;
    }

    setSubmitting(true);
    try {
      // 1) Návštěvník – najdi podle jména nebo vytvoř nového
      let resolvedVisitorId: string | undefined;
      const existing = visitors.find((v) => v.name.toLowerCase() === trimmedName.toLowerCase());
      if (existing) {
        resolvedVisitorId = existing._id;
      } else {
        const created = await visitorService.createVisitor({ name: trimmedName, email: "" });
        resolvedVisitorId = created.visitorId;
      }

      const orderPayload = {
        visitorId: resolvedVisitorId,
        note: note.trim() || undefined,
        date: todayISODate(),
      };

      // 2) Rezervace – vytvoř nebo uprav
      let orderId: string;
      if (editing && reservation) {
        await orderService.updateReservation(reservation.order._id, orderPayload);
        orderId = reservation.order._id;
      } else {
        orderId = await orderService.createReservation(orderPayload);
      }

      // 3) SPZ – smaž staré, vlož nové
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
        className="bg-primary rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
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
          {/* Jméno */}
          <section>
            <label className="text-xs text-text-secondary block mb-1">Jméno hosta</label>
            <input
              list="visitor-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jméno hosta…"
              className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary"
            />
            <datalist id="visitor-names">
              {visitors.map((v) => (
                <option key={v._id} value={v.name} />
              ))}
            </datalist>
          </section>

          {/* Poznámka */}
          <section>
            <label className="text-xs text-text-secondary block mb-1">Poznámka</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Volitelná poznámka k rezervaci…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm resize-none"
            />
          </section>

          {/* Termín */}
          <section className="grid grid-cols-2 gap-3">
            <label className="text-xs text-text-secondary">
              Od
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary mt-1" />
            </label>
            <label className="text-xs text-text-secondary">
              Do
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary mt-1" />
            </label>
          </section>

          {/* SPZ */}
          <section>
            <label className="text-xs text-text-secondary block mb-2">SPZ (whitelist v termínu)</label>
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
