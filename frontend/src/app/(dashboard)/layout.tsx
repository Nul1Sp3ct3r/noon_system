import Sidebar from '@/components/sidebar';
import { ToastProvider } from '@/lib/toast-context';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50">
        <Sidebar />
        <main className="mr-60 min-h-screen">
          <div className="max-w-7xl mx-auto p-6">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
