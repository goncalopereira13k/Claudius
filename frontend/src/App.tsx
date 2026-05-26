import { Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { routes } from "./routes";

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">A carregar...</div>}>
        <Routes>
          <Route path="/" element={<Layout />}>
            {routes.map(({ path, component: Page, index }) =>
              index
                ? <Route key={path} index element={<Page />} />
                : <Route key={path} path={path} element={<Page />} />
            )}
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
