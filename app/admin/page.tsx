import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <AdminDashboard />
      </main>
      <Footer />
    </>
  );
}
