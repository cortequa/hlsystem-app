import { useEffect, useState } from "react";

/**
 * Zpožděná hodnota pro vyhledávací pole. Bez toho by se dotaz posílal
 * na každý stisk klávesy — dřív se navíc pokaždé prohledávalo a znovu řadilo
 * celé pole objednávek v paměti.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
