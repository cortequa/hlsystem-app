import { useEffect, useState } from "react";
import type { UpdateState } from "../types/electron";

/**
 * Stav aktualizací vpravo dole. Obsluha na pokladně neumí stáhnout novou verzi
 * ručně, takže tady vidí, jakou verzi má, a aktualizaci může vyvolat i
 * nainstalovat jedním kliknutím. Stahování samo běží automaticky
 * (electron/updater.ts) — tohle je jen okno do něj.
 *
 * V klidu je to jen malý štítek (vpravo dole je na pokladně panel brány);
 * výrazná karta se ukáže jen při stahování a když je nová verze připravená.
 */
export default function UpdateStatus() {
  const updater = window.electronAPI?.updater;
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!updater) return;
    const off = updater.onState(setState);
    void updater.getState().then(setState);
    return off;
  }, [updater]);

  // Hláška „máte aktuální verzi" po ruční kontrole zmizí sama.
  useEffect(() => {
    if (state?.status !== "not-available") return;
    const t = setTimeout(() => setState((s) => (s ? { ...s, status: "idle" } : s)), 5000);
    return () => clearTimeout(t);
  }, [state?.status]);

  if (!updater || !state || state.status === "unsupported") return null;

  if (state.status === "downloaded") {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-xl bg-link p-4 text-white shadow-lg">
        <div className="font-semibold">Nová verze {state.version} je připravená</div>
        <div className="mt-1 text-sm opacity-90">
          Nainstaluje se sama při zavření aplikace, nebo hned:
        </div>
        <button
          onClick={() => void updater.install()}
          className="mt-3 w-full rounded-lg bg-white px-4 py-2 font-medium text-link hover:opacity-90"
        >
          Restartovat a nainstalovat
        </button>
      </div>
    );
  }

  if (state.status === "downloading") {
    const percent = Math.round(state.percent ?? 0);
    return (
      <div className="fixed bottom-4 right-4 z-50 w-64 rounded-xl bg-link p-3 text-white shadow-lg">
        <div className="text-sm font-semibold">Stahuji verzi {state.version}…</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/30">
          <div className="h-full bg-white transition-all" style={{ width: `${percent}%` }} />
        </div>
        <div className="mt-1 text-xs opacity-90">{percent} %</div>
      </div>
    );
  }

  const label =
    state.status === "checking"
      ? "Hledám aktualizace…"
      : state.status === "not-available"
        ? "Máte nejnovější verzi"
        : state.status === "error"
          ? "Aktualizace se nepodařila — zkusit znovu"
          : "Zkontrolovat aktualizace";

  return (
    <button
      onClick={() => void updater.check()}
      disabled={state.status === "checking"}
      title={state.status === "error" ? state.error : undefined}
      className={`fixed bottom-2 right-2 z-50 rounded-full border border-secondary bg-primary px-3 py-1 text-xs shadow hover:opacity-100 disabled:opacity-70 ${
        state.status === "error" ? "text-error" : "text-text-secondary"
      }`}
    >
      v{state.currentVersion} · {label}
    </button>
  );
}
