import { FormEvent, useCallback, useState } from "react";
import Pagination from "../components/Pagination";
import { useDebounced } from "../hooks/useDebounced";
import { usePagedList } from "../hooks/usePagedList";
import { licensePlateService } from "../services/licensePlateService";
import { stayService } from "../services/stayService";
import {
  AccessCheckResult,
  LicensePlate,
  PlateRuleKind,
  accessReasonLabel,
} from "../types/licensePlate";
import { Stay } from "../types/stay";

export default function LicensePlates() {
  const [error, setError] = useState<string | null>(null);

  // Dva nezávislé seznamy = dvě nezávislá stránkování.
  const allowRules = usePagedList<LicensePlate>({
    fetchPage: (page, limit, signal) =>
      licensePlateService.getAllowRulesPage(page, limit, signal),
    filterKey: [],
    initialLimit: 25,
  });
  const blacklist = usePagedList<LicensePlate>({
    fetchPage: (page, limit, signal) =>
      licensePlateService.getBlacklistPage(page, limit, signal),
    filterKey: [],
    initialLimit: 25,
  });

  const { reload: reloadAllow } = allowRules;
  const { reload: reloadBlacklist } = blacklist;
  const refresh = useCallback(() => {
    setError(null);
    reloadAllow();
    reloadBlacklist();
  }, [reloadAllow, reloadBlacklist]);

  const handleDelete = async (id: string) => {
    try {
      await licensePlateService.remove(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Smazání selhalo.");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-primary">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Správa SPZ</h1>
      <p className="text-sm text-text-secondary mb-4">
        Ruční pravidla platí nezávisle na rezervacích. Vozidla hostů se spravují
        u pobytu v sekci Rezervace — platnost mají z termínu pobytu.
      </p>

      {(error ?? allowRules.error ?? blacklist.error) && (
        <div className="mb-4 text-error text-sm">
          {error ?? allowRules.error ?? blacklist.error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AddRuleForm onCreated={refresh} onError={setError} />
        <CheckPlate />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <PlateTable
          title="Ruční povolení"
          hint="Zaměstnanci, dodavatelé — mimo rezervace."
          list={allowRules}
          onDelete={handleDelete}
          showValidity
        />
        <PlateTable
          title="Blacklist (blokované)"
          hint="Má vždy přednost. Na výjezdu auto pustíme, ale upozorníme obsluhu."
          list={blacklist}
          onDelete={handleDelete}
          showReason
        />
      </div>

      <div className="mt-6">
        <StayVehicles />
      </div>
    </div>
  );
}

function AddRuleForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<PlateRuleKind>("allow");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await licensePlateService.create(text.trim(), {
        kind,
        // Platnost dává smysl jen u povolení — blacklist neexpiruje.
        from: kind === "allow" && from ? new Date(from).toISOString() : undefined,
        to: kind === "allow" && to ? new Date(to).toISOString() : undefined,
        reason: reason.trim() || undefined,
      });
      setText("");
      setFrom("");
      setTo("");
      setReason("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Přidání pravidla selhalo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Přidat ruční pravidlo</h2>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="SPZ (např. 1AB2345)"
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase"
      />
      <div className="flex gap-4 text-sm text-text-primary">
        {(["allow", "blacklist"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              checked={kind === value}
              onChange={() => setKind(value)}
            />
            {value === "allow" ? "Povolit" : "Blokovat"}
          </label>
        ))}
      </div>
      {kind === "allow" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-text-secondary">
            Platí od
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary"
            />
          </label>
          <label className="text-xs text-text-secondary">
            Platí do
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary"
            />
          </label>
        </div>
      )}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={kind === "blacklist" ? "Důvod zákazu (doporučeno)" : "Poznámka"}
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? "Ukládám…" : "Přidat"}
      </button>
    </form>
  );
}

function CheckPlate() {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<"entry" | "exit">("entry");
  const [result, setResult] = useState<AccessCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setChecking(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await licensePlateService.check(text.trim(), direction));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Ověření selhalo.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={check} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Ověřit průjezd</h2>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SPZ k ověření"
          className="flex-1 px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "entry" | "exit")}
          className="px-2 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
        >
          <option value="entry">Vjezd</option>
          <option value="exit">Výjezd</option>
        </select>
        <button
          type="submit"
          disabled={checking || !text.trim()}
          className="bg-link hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          Ověřit
        </button>
      </div>
      {err && <div className="text-error text-sm">{err}</div>}
      {result && (
        <div
          className={`rounded-lg p-3 text-sm ${
            result.decision === "allow" ? "bg-success/15 text-success" : "bg-error/15 text-error"
          }`}
        >
          <span className="font-semibold">
            {result.decision === "allow" ? "POVOLIT" : "ZAMÍTNOUT"}
          </span>{" "}
          — {accessReasonLabel[result.reason]}
          {result.alert && (
            <div className="mt-1 font-semibold">⚠️ Zavolej obsluhu.</div>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * Vozidla hostů — jen ke čtení. Spravují se u pobytu, ne tady; tahle sekce
 * existuje proto, aby obsluha mohla dohledat, komu SPZ patří, aniž by
 * musela procházet rezervace.
 */
function StayVehicles() {
  const [plate, setPlate] = useState("");
  const debounced = useDebounced(plate);

  const list = usePagedList<Stay>({
    fetchPage: (page, limit, signal) =>
      stayService.getStaysPage(
        {
          page,
          limit,
          status: "booked",
          ...(debounced.trim() ? { plate: debounced.trim() } : {}),
        },
        signal,
      ),
    filterKey: [debounced],
    initialLimit: 10,
  });

  return (
    <div className="bg-secondary/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h2 className="font-semibold text-text-primary">
          Vozidla z pobytů{" "}
          <span className="text-text-secondary text-sm">({list.total} rezervací)</span>
        </h2>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="Hledat podle SPZ…"
          className="px-3 py-1.5 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase text-sm"
        />
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Jen ke čtení — přidat nebo odebrat auto jde u rezervace.
      </p>
      {list.loading ? (
        <div className="text-sm text-text-secondary">Načítání…</div>
      ) : list.items.length === 0 ? (
        <div className="text-sm text-text-secondary">Žádné rezervace.</div>
      ) : (
        <ul className="space-y-1.5">
          {list.items.map((stay) => (
            <li key={stay._id} className="flex items-center justify-between gap-3 text-sm border-b border-secondary/50 pb-1.5">
              <div className="flex flex-wrap gap-1.5">
                {stay.vehicles.length === 0 ? (
                  <span className="text-xs text-text-secondary italic">bez SPZ</span>
                ) : (
                  stay.vehicles.map((v) => (
                    <span key={v.plateNormalized} className="font-mono font-semibold text-text-primary">
                      {v.plate}
                    </span>
                  ))
                )}
              </div>
              <span className="text-xs text-text-secondary shrink-0">
                {formatValidity(stay.from, stay.to)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={list.page}
        limit={list.limit}
        total={list.total}
        loading={list.loading}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
      />
    </div>
  );
}

type PlateList = ReturnType<typeof usePagedList<LicensePlate>>;

function PlateTable({
  title,
  hint,
  list,
  onDelete,
  showValidity = false,
  showReason = false,
}: {
  title: string;
  hint: string;
  list: PlateList;
  onDelete: (id: string) => void;
  showValidity?: boolean;
  showReason?: boolean;
}) {
  const { items: plates, loading } = list;
  return (
    <div className="bg-secondary/30 rounded-xl p-4">
      <h2 className="font-semibold text-text-primary">
        {/* Počet je z `total`, ne z délky stránky. */}
        {title} <span className="text-text-secondary text-sm">({list.total})</span>
      </h2>
      <p className="text-xs text-text-secondary mb-3">{hint}</p>
      {loading ? (
        <div className="text-sm text-text-secondary">Načítání…</div>
      ) : plates.length === 0 ? (
        <div className="text-sm text-text-secondary">Prázdné.</div>
      ) : (
        <ul className="space-y-1.5">
          {plates.map((p) => (
            <li key={p._id} className="flex items-center justify-between text-sm border-b border-secondary/50 pb-1.5">
              <div className="min-w-0">
                <span className="font-mono font-semibold text-text-primary">{p.text}</span>
                {showValidity && (p.from || p.to) && (
                  <span className="ml-2 text-xs text-text-secondary">{formatValidity(p.from, p.to)}</span>
                )}
                {showReason && p.reason && (
                  <span className="ml-2 text-xs text-text-secondary">{p.reason}</span>
                )}
              </div>
              <button
                onClick={() => onDelete(p._id)}
                className="text-error hover:opacity-80 text-xs shrink-0"
                title="Smazat pravidlo"
              >
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={list.page}
        limit={list.limit}
        total={list.total}
        loading={loading}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
      />
    </div>
  );
}

function formatValidity(from?: string, to?: string): string {
  const f = from ? new Date(from).toLocaleDateString("cs-CZ") : "…";
  const t = to ? new Date(to).toLocaleDateString("cs-CZ") : "…";
  return `${f} – ${t}`;
}
