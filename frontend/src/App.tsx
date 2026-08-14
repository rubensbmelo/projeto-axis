import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { api, setOrgId } from "@/api/client";
import type { OrgMembership } from "@/types";
import { PageLoader } from "@/components/spinner";
import LoginPage from "@/pages/LoginPage";
import OnboardingPage from "@/pages/OnboardingPage";
import AppLayout from "@/components/AppLayout";
import CasesPage from "@/pages/CasesPage";
import CaseFormPage from "@/pages/CaseFormPage";
import CaseDetailPage from "@/pages/CaseDetailPage";
import PatientsPage from "@/pages/PatientsPage";
import ReferencePage from "@/pages/ReferencePage";
import ReportsPage from "@/pages/ReportsPage";
import MembersPage from "@/pages/MembersPage";

export default function App() {
  const { user, loading } = useAuth();
  const [memberships, setMemberships] = useState<OrgMembership[] | null>(null);

  useEffect(() => {
    if (!user) {
      setMemberships(null);
      return;
    }
    api
      .get<{ memberships: OrgMembership[]; active_org_id: string }>("/organizations/me")
      .then((data) => {
        setMemberships(data.memberships);
        if (data.active_org_id) setOrgId(data.active_org_id);
      })
      .catch(() => setMemberships([]));
  }, [user]);

  if (loading) return <PageLoader />;
  if (!user) {
    return (
      <div key="login" className="animate-in fade-in-0 duration-200 ease-[var(--ease-axis-out)]">
        <LoginPage />
      </div>
    );
  }
  if (memberships === null) return <PageLoader />;
  if (memberships.length === 0) {
    return (
      <div key="onboarding" className="animate-in fade-in-0 duration-200 ease-[var(--ease-axis-out)]">
        <OnboardingPage
          onCreated={(orgId) => {
            setOrgId(orgId);
            setMemberships([{ org_id: orgId, role: "owner", org_member_id: "" }]);
          }}
        />
      </div>
    );
  }

  return (
    <div key="app" className="animate-in fade-in-0 duration-200 ease-[var(--ease-axis-out)]">
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/casos" replace />} />
          <Route path="/casos" element={<CasesPage />} />
          <Route path="/casos/novo" element={<CaseFormPage />} />
          <Route path="/casos/:id" element={<CaseDetailPage />} />
          <Route path="/casos/:id/editar" element={<CaseFormPage />} />
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/cadastros" element={<ReferencePage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/membros" element={<MembersPage />} />
          <Route path="*" element={<Navigate to="/casos" replace />} />
        </Routes>
      </AppLayout>
    </div>
  );
}
