import { FormEvent, useCallback, useEffect, useState } from "react";
import { licensePlateService } from "../services/licensePlateService";
import { AccessCheckResult, LicensePlate } from "../types/licensePlate";

const reasonLabel: Record<AccessCheckResult["reason"], string> = {
  not_found: "SPZ není evidována",
  blacklisted: "na blacklistu",
  no_valid_reservation: "bez platné rezervace",
  expired: "platnost vypršela",
  not_yet_valid: "ještě neplatí",
  valid: "platná",
};

export default function LicensePlates() {
  const [whitelist, setWhitelist] = useState<LicensePlate[]>([]);
  const [blacklist, setBlacklist] = useState<LicensePlate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wl, bl] = await Promise.all([
        licensePlateService.getWhitelist(),
        licensePlateService.getBlacklist(),
      ]);
      setWhitelist(wl);
      setBlacklist(bl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Načtení SPZ selhalo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = async (id: string) => {
    if (!confirm("Opravdu smazat tuto SPZ?")) return;
    try {
      await licensePlateService.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Smazání selhalo.");
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-primary">
      <h1 className="text-2xl font-bold text-text-primary mb-4">Správa SPZ</h1>

      {error && <div className="mb-4 text-error text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AddPlateForm onCreated={refresh} onError={setError} />
        <CheckPlate />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <PlateTable
          title="Whitelist (povolené)"
          plates={whitelist}
          loading={loading}
          onDelete={handleDelete}
          showValidity
        />
        <PlateTable
          title="Blacklist (blokované)"
          plates={blacklist}
          loading={loading}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

function AddPlateForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [blacklisted, setBlacklisted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await licensePlateService.create(text.trim(), {
        blacklisted,
        from: !blacklisted && from ? new Date(from).toISOString() : undefined,
        to: !blacklisted && to ? new Date(to).toISOString() : undefined,
      });
      setText("");
      setFrom("");
      setTo("");
      setBlacklisted(false);
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Přidání SPZ selhalo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Přidat SPZ</h2>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="SPZ (např. 1AB2345)"
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase"
      />
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={blacklisted} onChange={(e) => setBlacklisted(e.target.checked)} />
        Blokovat (blacklist)
      </label>
      {!blacklisted && (
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
      setResult(await licensePlateService.check(text.trim()));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Ověření selhalo.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={check} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Ověřit vjezd</h2>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SPZ k ověření"
          className="flex-1 px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase"
        />
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
          — {reasonLabel[result.reason]}
        </div>
      )}
    </form>
  );
}

function PlateTable({
  title,
  plates,
  loading,
  onDelete,
  showValidity = false,
}: {
  title: string;
  plates: LicensePlate[];
  loading: boolean;
  onDelete: (id: string) => void;
  showValidity?: boolean;
}) {
  return (
    <div className="bg-secondary/30 rounded-xl p-4">
      <h2 className="font-semibold text-text-primary mb-3">
        {title} <span className="text-text-secondary text-sm">({plates.length})</span>
      </h2>
      {loading ? (
        <div className="text-sm text-text-secondary">Načítání…</div>
      ) : plates.length === 0 ? (
        <div className="text-sm text-text-secondary">Prázdné.</div>
      ) : (
        <ul className="space-y-1.5">
          {plates.map((p) => (
            <li key={p._id} className="flex items-center justify-between text-sm border-b border-secondary/50 pb-1.5">
              <div>
                <span className="font-mono font-semibold text-text-primary">{p.text}</span>
                {showValidity && (p.from || p.to) && (
                  <span className="ml-2 text-xs text-text-secondary">{formatValidity(p.from, p.to)}</span>
                )}
              </div>
              <button
                onClick={() => onDelete(p._id)}
                className="text-error hover:opacity-80 text-xs"
                title="Smazat SPZ"
              >
                Smazat
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatValidity(from?: string, to?: string): string {
  const f = from ? new Date(from).toLocaleDateString("cs-CZ") : "…";
  const t = to ? new Date(to).toLocaleDateString("cs-CZ") : "…";
  return `${f} – ${t}`;
}
