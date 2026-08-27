import { FormEvent, useCallback, useEffect, useState } from "react";
import Pagination from "../components/Pagination";
import { useDebounced } from "../hooks/useDebounced";
import { usePagedList } from "../hooks/usePagedList";
import { useSocketEvent } from "../hooks/useRealtime";
import { RealtimeEvents } from "../services/realtimeService";
import { showerService } from "../services/showerService";
import {
  ChipStatus,
  ChipTransaction,
  DeviceMode,
  ShowerChip,
  ShowerDevice,
  ShowerEvent,
  ShowerEventMessage,
  ShowerReason,
  chipStatusLabel,
  deviceModeLabel,
  showerReasonLabel,
  transactionKindLabel,
} from "../types/shower";

type Tab = "chips" | "devices" | "history";
type StatusFilter = ChipStatus | "all";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "in_stock", label: "Skladem" },
  { value: "issued", label: "Vydané" },
  { value: "lost", label: "Ztracené" },
];

const statusClass: Record<ChipStatus, string> = {
  in_stock: "bg-secondary/60 text-text-secondary",
  issued: "bg-success/15 text-success",
  lost: "bg-error/15 text-error",
  retired: "bg-secondary/60 text-text-secondary",
};

const reasonText = (reason: string): string =>
  showerReasonLabel[reason as ShowerReason] ?? reason;

/** Čtečka bez ozvěny déle než tohle se považuje za offline. */
const OFFLINE_AFTER_MS = 3 * 60 * 1000;

export default function Showers() {
  const [tab, setTab] = useState<Tab>("chips");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="h-full overflow-y-auto p-6 bg-primary">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Sprchy</h1>
      <p className="text-sm text-text-secondary mb-4">
        Čip je jen nosič ID — kredit i rozhodnutí drží server. Jedno otevření
        dveří = jeden vstup.
      </p>

      <div className="flex gap-2 mb-4">
        {(
          [
            ["chips", "Čipy"],
            ["devices", "Zařízení"],
            ["history", "Historie"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              tab === value
                ? "bg-link text-white"
                : "bg-secondary text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 text-error text-sm">{error}</div>}

      {tab === "chips" && <ChipsTab onError={setError} />}
      {tab === "devices" && <DevicesTab onError={setError} />}
      {tab === "history" && <HistoryTab onError={setError} />}
    </div>
  );
}

function ChipsTab({ onError }: { onError: (msg: string | null) => void }) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const [selected, setSelected] = useState<ShowerChip | null>(null);

  const list = usePagedList<ShowerChip>({
    fetchPage: (page, limit, signal) =>
      showerService.getChipsPage(
        {
          page,
          limit,
          ...(status === "all" ? {} : { status }),
          ...(debounced.trim() ? { search: debounced.trim() } : {}),
        },
        signal,
      ),
    filterKey: [status, debounced],
    initialLimit: 25,
  });

  const { reload } = list;

  // Přiložení čipu u sprch mění zůstatek — seznam se má srovnat sám.
  useSocketEvent<ShowerEventMessage>(RealtimeEvents.showerEvent, () => reload());

  const run = async (action: () => Promise<unknown>, failure: string) => {
    onError(null);
    try {
      await action();
      reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : failure);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <AddChipForm onCreated={reload} onError={onError} />
        <AdjustForm onDone={reload} onError={onError} />
      </div>

      <div className="bg-secondary/30 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="font-semibold text-text-primary">
            Čipy <span className="text-text-secondary text-sm">({list.total})</span>
          </h2>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="UID nebo číslo čipu…"
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
          </div>
        </div>

        {list.loading ? (
          <div className="text-sm text-text-secondary">Načítání…</div>
        ) : list.items.length === 0 ? (
          <div className="text-sm text-text-secondary">Žádné čipy.</div>
        ) : (
          <ul className="space-y-1.5">
            {list.items.map((chip) => (
              <li
                key={chip._id}
                className="flex items-center justify-between gap-3 text-sm border-b border-secondary/50 pb-1.5 flex-wrap"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-mono font-semibold text-text-primary">
                    {chip.uid}
                  </span>
                  {chip.label && (
                    <span className="text-xs text-text-secondary">#{chip.label}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[chip.status]}`}>
                    {chipStatusLabel[chip.status]}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      chip.balance > 0 ? "text-success" : "text-error"
                    }`}
                  >
                    {chip.balance} vstupů
                  </span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setSelected(chip)}
                    className="bg-secondary text-text-primary px-2 py-1 rounded text-xs"
                  >
                    Pohyby
                  </button>
                  {chip.status === "issued" && (
                    <button
                      onClick={() =>
                        void run(
                          () => showerService.returnChip(chip.uid),
                          "Vrácení čipu selhalo.",
                        )
                      }
                      className="bg-link text-white px-2 py-1 rounded text-xs"
                    >
                      Vrátit
                    </button>
                  )}
                  {chip.status !== "lost" && (
                    <button
                      onClick={() =>
                        void run(
                          () => showerService.markLost(chip.uid),
                          "Nahlášení ztráty selhalo.",
                        )
                      }
                      className="bg-error text-white px-2 py-1 rounded text-xs"
                    >
                      Ztráta
                    </button>
                  )}
                </div>
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

      {selected && (
        <TransactionsModal chip={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function AddChipForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string | null) => void;
}) {
  const [uid, setUid] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!uid.trim()) return;
    setSubmitting(true);
    onError(null);
    try {
      await showerService.createChip(uid.trim(), label.trim() || undefined);
      setUid("");
      setLabel("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Založení čipu selhalo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Zavést čip do skladu</h2>
      {/* USB čtečka na pokladně emuluje klávesnici — UID se do pole prostě
          „napíše", stačí do něj kliknout a přiložit čip. */}
      <input
        value={uid}
        onChange={(e) => setUid(e.target.value)}
        placeholder="UID — přilož čip ke čtečce"
        autoFocus
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Číslo vyražené na čipu (volitelné)"
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !uid.trim()}
        className="bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? "Ukládám…" : "Zavést"}
      </button>
    </form>
  );
}

function AdjustForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [uid, setUid] = useState("");
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!uid.trim() || !note.trim() || amount === 0) return;
    setSubmitting(true);
    onError(null);
    try {
      await showerService.adjust(uid.trim(), amount, note.trim());
      setUid("");
      setNote("");
      setAmount(1);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Oprava selhala.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-secondary/30 rounded-xl p-4 space-y-3">
      <h2 className="font-semibold text-text-primary">Ruční oprava kreditu</h2>
      <p className="text-xs text-text-secondary">
        Reklamace, překlep. Důvod je povinný — jinak by změna byla v účetní
        knize nedohledatelná.
      </p>
      <div className="flex gap-2">
        <input
          value={uid}
          onChange={(e) => setUid(e.target.value)}
          placeholder="UID čipu"
          className="flex-1 px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary font-mono uppercase text-sm"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className="w-20 px-2 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Důvod opravy"
        className="w-full px-3 py-2 rounded-lg border border-secondary bg-primary text-text-primary text-sm"
      />
      <button
        type="submit"
        disabled={submitting || !uid.trim() || !note.trim() || amount === 0}
        className="bg-link hover:opacity-90 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
      >
        {submitting ? "Ukládám…" : "Opravit"}
      </button>
    </form>
  );
}

function TransactionsModal({
  chip,
  onClose,
}: {
  chip: ShowerChip;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ChipTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    showerService
      .getTransactions(chip._id, controller.signal)
      .then((rows) => setItems(rows))
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [chip._id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-primary rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-secondary">
          <h3 className="font-semibold text-text-primary">
            Pohyby čipu <span className="font-mono">{chip.uid}</span>
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="text-sm text-text-secondary">Načítání…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-text-secondary">Žádné pohyby.</div>
          ) : (
            <ul className="space-y-1">
              {items.map((tx) => (
                <li
                  key={tx._id}
                  className="flex items-center justify-between gap-2 text-sm border-b border-secondary/40 pb-1"
                >
                  <div className="min-w-0">
                    <span className="text-text-primary">
                      {transactionKindLabel[tx.kind] ?? tx.kind}
                    </span>
                    {tx.note && (
                      <span className="ml-2 text-xs text-text-secondary">{tx.note}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-semibold ${
                        tx.amount > 0
                          ? "text-success"
                          : tx.amount < 0
                            ? "text-error"
                            : "text-text-secondary"
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                    </span>
                    <span className="text-xs text-text-secondary w-8 text-right">
                      {tx.balanceAfter}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {formatDateTime(tx.occurredAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
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

function DevicesTab({ onError }: { onError: (msg: string | null) => void }) {
  const [devices, setDevices] = useState<ShowerDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const controller = new AbortController();
    showerService
      .getDevices(controller.signal)
      .then(setDevices)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        onError(err instanceof Error ? err.message : "Načtení zařízení selhalo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onError]);

  useEffect(() => load(), [load]);

  const setMode = async (device: ShowerDevice, mode: DeviceMode) => {
    onError(null);
    try {
      await showerService.setDeviceMode(device._id, mode);
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Změna režimu selhala.");
    }
  };

  if (loading) return <div className="text-sm text-text-secondary">Načítání…</div>;
  if (devices.length === 0) {
    return (
      <div className="text-sm text-text-secondary">
        Žádná zařízení. Jednotku je potřeba nejdřív zaregistrovat — její
        <code className="mx-1 font-mono">DEVICE_ID</code> musí sedět s klíčem
        zařízení.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {devices.map((device) => {
        const online =
          device.lastSeenAt !== undefined &&
          Date.now() - new Date(device.lastSeenAt).getTime() < OFFLINE_AFTER_MS;
        return (
          <div key={device._id} className="bg-secondary/30 rounded-xl p-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-text-primary">{device.name}</span>
                <span className="text-xs font-mono text-text-secondary">
                  {device.deviceKey}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    online ? "bg-success/15 text-success" : "bg-error/15 text-error"
                  }`}
                >
                  {online ? "živě" : "offline"}
                </span>
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {device.location && <span className="mr-2">{device.location}</span>}
                návrat zdarma do {device.graceSeconds} s · odemčení{" "}
                {device.unlockSeconds} s · offline limit {device.offlineMaxEntries}
              </div>
              {device.lastSeenAt && (
                <div className="text-xs text-text-secondary">
                  naposled {formatDateTime(device.lastSeenAt)}
                </div>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap">
              {(["credit", "free", "closed"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => void setMode(device, mode)}
                  className={`px-2 py-1 rounded text-xs ${
                    device.mode === mode
                      ? "bg-link text-white"
                      : "bg-secondary text-text-primary"
                  }`}
                >
                  {deviceModeLabel[mode]}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({ onError }: { onError: (msg: string | null) => void }) {
  const [events, setEvents] = useState<ShowerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    showerService
      .getEvents({}, controller.signal)
      .then(setEvents)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        onError(err instanceof Error ? err.message : "Načtení historie selhalo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [onError]);

  // Nové přiložení se přidá nahoru bez znovunačtení celého seznamu.
  useSocketEvent<ShowerEventMessage>(RealtimeEvents.showerEvent, (msg) => {
    setEvents((prev) => [
      {
        _id: msg.showerEventId,
        deviceId: msg.deviceId,
        chipUid: msg.chipUid,
        decision: msg.decision,
        reason: msg.reason,
        balanceAfter: msg.balanceAfter,
        offline: msg.offline,
        occurredAt: msg.occurredAt,
      },
      ...prev.slice(0, 49),
    ]);
  });

  if (loading) return <div className="text-sm text-text-secondary">Načítání…</div>;
  if (events.length === 0) {
    return <div className="text-sm text-text-secondary">Zatím žádná přiložení.</div>;
  }

  return (
    <ul className="space-y-1">
      {events.map((event) => (
        <li
          key={event._id}
          className="flex items-center justify-between gap-3 text-sm bg-secondary/30 rounded-lg px-3 py-2 flex-wrap"
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                event.decision === "allow"
                  ? "bg-success/15 text-success"
                  : "bg-error/15 text-error"
              }`}
            >
              {event.decision === "allow" ? "PUSTIT" : "ZAMÍTNOUT"}
            </span>
            <span className="font-mono text-text-primary">{event.chipUid}</span>
            <span className="text-xs text-text-secondary">
              {reasonText(event.reason)}
            </span>
            {event.offline && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/60 text-text-secondary">
                offline
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0 text-xs text-text-secondary">
            {event.balanceAfter !== undefined && <span>zbývá {event.balanceAfter}</span>}
            <span>{formatDateTime(event.occurredAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("cs-CZ");
}
