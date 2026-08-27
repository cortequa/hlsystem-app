import { FormEvent, useMemo, useState } from "react";
import { stayService } from "../services/stayService";
import { Stay } from "../types/stay";
import { Visitor, splitName, visitorFullName } from "../types/visitor";

interface Props {
  visitors: Visitor[];
  /** `null` = nová rezervace. */
  stay: Stay | null;
  onClose: () => void;
  onSaved: () => void;
}

const toDateInput = (iso?: string): string => (iso ? iso.split("T")[0] : "");

/** `<input type="date">` dává den bez času — půlnoc čteme v místním pásmu. */
const fromDateInput = (day: string): string =>
  new Date(`${day}T00:00:00`).toISOString();

const todayISODate = (): string => toDateInput(new Date().toISOString());

export default function ReservationModal({ visitors, stay, onClose, onSaved }: Props) {
  const editing = stay !== null;

  const visitorMap = useMemo(
    () => new Map(visitors.map((v) => [v._id, v])),
    [visitors],
  );

  const [name, setName] = useState(
    () => (stay ? visitorFullName(visitorMap.get(stay.visitorId)) : ""),
  );
  const [note, setNote] = useState(stay?.note ?? "");
  const [from, setFrom] = useState(toDateInput(stay?.from) || todayISODate());
  const [to, setTo] = useState(toDateInput(stay?.to));

  // U nové rezervace se SPZ sbírají lokálně a uloží se spolu s pobytem.
  // U existující jdou rovnou na server (`POST /stays/:id/vehicles`), aby se
  // auto přidané u brány neztratilo, když obsluha formulář nakonec zavře.
  const [plateText, setPlateText] = useState("");
  const [newPlates, setNewPlates] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState(stay?.vehicles ?? []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlate = async () => {
    const plate = plateText.trim().toUpperCase();
    if (!plate) return;
    setError(null);

    if (!editing) {
      if (!newPlates.includes(plate)) setNewPlates((prev) => [...prev, plate]);
      setPlateText("");
      return;
    }

    try {
      const updated = await stayService.addVehicle(stay._id, plate);
      setVehicles(updated.vehicles);
      setPlateText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Přidání SPZ selhalo.");
    }
  };

  const removeVehicle = async (plateNormalized: string) => {
    if (!editing) return;
    setError(null);
    try {
      const updated = await stayService.removeVehicle(stay._id, plateNormalized);
      setVehicles(updated.vehicles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Odebrání SPZ selhalo.");
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!from || !to) {
      setError("Vyplň termín pobytu (od–do).");
      return;
    }
    if (new Date(to) <= new Date(from)) {
      setError("Datum odjezdu musí být po datu příjezdu.");
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        await stayService.update(stay._id, {
          from: fromDateInput(from),
          to: fromDateInput(to),
          note: note.trim(),
        });
        onSaved();
        return;
      }

      const parsed = splitName(name);
      if (!parsed) {
        setError("Zadej jméno hosta.");
        return;
      }
      // Host se dohledá podle celého jména; když neexistuje, založí ho API
      // spolu s pobytem — jedno volání, žádný host bez rezervace při chybě.
      const existing = visitors.find(
        (v) => visitorFullName(v).toLowerCase() === name.trim().toLowerCase(),
      );

      await stayService.create({
        ...(existing ? { visitorId: existing._id } : { visitor: parsed }),
        from: fromDateInput(from),
        to: fromDateInput(to),
        ...(note.trim() ? { note: note.trim() } : {}),
        vehicles: newPlates.map((plate) => ({ plate })),
        ...(newPlates.length > 2 ? { maxVehicles: newPlates.length } : {}),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení rezervace selhalo.");
    } finally {
      setSubmitting(false);
    }
  };

  const shownPlates = editing
    ? vehicles.map((v) => ({ label: v.plate, key: v.plateNormalized }))
    : newPlates.map((p) => ({ label: p, key: p }));

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
          <section>
            <label className="text-xs text-text-secondary block mb-1">Jméno hosta</label>
            <input
              list="visitor-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={editing}
              placeholder="Jméno hosta…"
              className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary disabled:opacity-60"
            />
            <datalist id="visitor-names">
              {visitors.map((v) => (
                <option key={v._id} value={visitorFullName(v)} />
              ))}
            </datalist>
          </section>

          <section>
            <label className="text-xs text-text-secondary block mb-1">Poznámka</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Volitelná poznámka k pobytu…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm resize-none"
            />
          </section>

          {/* Termín patří pobytu — dřív byl rozkopírovaný na každé SPZ zvlášť
              a prodloužení znamenalo přepsat je jednu po druhé. */}
          <section className="grid grid-cols-2 gap-3">
            <label className="text-xs text-text-secondary">
              Příjezd
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary mt-1" />
            </label>
            <label className="text-xs text-text-secondary">
              Odjezd
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary mt-1" />
            </label>
          </section>

          <section>
            <label className="text-xs text-text-secondary block mb-2">
              Vozidla {editing && <span className="opacity-70">(ukládají se hned)</span>}
            </label>
            <div className="flex gap-2 mb-2">
              <input
                value={plateText}
                onChange={(e) => setPlateText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addPlate();
                  }
                }}
                placeholder="SPZ"
                className="flex-1 px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase text-sm"
              />
              <button type="button" onClick={() => void addPlate()} className="bg-secondary text-text-primary px-3 py-2 rounded-lg text-sm">
                Přidat
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {shownPlates.map((p) => (
                <span key={p.key} className="flex items-center gap-1 bg-secondary/60 text-text-primary px-2 py-1 rounded-full text-xs font-mono">
                  {p.label}
                  <button
                    type="button"
                    onClick={() =>
                      editing
                        ? void removeVehicle(p.key)
                        : setNewPlates((prev) => prev.filter((x) => x !== p.key))
                    }
                    className="text-error"
                  >
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
            Zavřít
          </button>
          <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg text-sm bg-success text-white disabled:opacity-50">
            {submitting ? "Ukládám…" : editing ? "Uložit změny" : "Vytvořit rezervaci"}
          </button>
        </div>
      </form>
    </div>
  );
}
