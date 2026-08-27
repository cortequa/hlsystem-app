import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
// Home je vstupní obrazovka (pokladna) — načítá se rovnou, ne přes lazy.
import Home from "./pages/Home";

// Ostatní obrazovky se stahují až při prvním otevření. Hlavní důvod je
// Metrics: statický import tahal `recharts` (+ balík d3) do jednoho chunku,
// který se pak parsoval i na pokladně, kde se graf nikdy nezobrazí.
const Sales = lazy(() => import("./pages/Sales"));
const Metrics = lazy(() => import("./pages/Metrics"));
const TaxReduction = lazy(() => import("./pages/TaxReduction"));
const Reservations = lazy(() => import("./pages/Reservations"));
const LicensePlates = lazy(() => import("./pages/LicensePlates"));
const Showers = lazy(() => import("./pages/Showers"));

import Navigation from "./components/Navigation";
import UpdateManager from "./components/UpdateManager";

function RouteFallback() {
  return (
    <div className="flex justify-center items-center h-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-link"></div>
    </div>
  );
}

function App() {
  return (
    <main className="flex h-screen w-screen p-0 m-0">
      <Navigation />
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/plates" element={<LicensePlates />} />
            <Route path="/showers" element={<Showers />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/tax-reduction" element={<TaxReduction />} />
          </Routes>
        </Suspense>
      </div>
      <UpdateManager />
    </main>
  );
}

export default App;
