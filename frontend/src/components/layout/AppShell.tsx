import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function AppShell() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto p-3 pt-14 md:p-6 md:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
