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
import InicioPage from "@/pages/InicioPage";
import PatientDetailPage from "@/pages/PatientDetailPage";
import EntityFichaPage from "@/pages/EntityFichaPage";

export default function App() {
  const { user, loading } = useAuth();
  const [memberships, setMemberships] = useState<OrgMembership[] | null>(null);
  const [organizationError, setOrganizationError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setMemberships(null);
      setOrganizationError(null);
      return;
    }
    let active = true;
    setMemberships(null);
    setOrganizationError(null);
    api
      .get<{ memberships: OrgMembership[]; active_org_id: string }>("/organizations/me")
      .then((data) => {
        if (!active) return;
        setMemberships(data.memberships);
        if (data.active_org_id) setOrgId(data.active_org_id);
      })
      .catch((error: Error) => {
        if (!active) return;
        console.error("Falha ao carregar organizações do usuário", error);
        setOrganizationError(error);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) return <PageLoader />;
  if (!user) {
    return (
      <div key="login" className="animate-in fade-in-0 duration-200 ease-[var(--ease-axis-out)]">
        <LoginPage />
      </div>
    );
  }
  if (organizationError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="grid max-w-md gap-3">
          <h1 className="text-lg font-semibold">Não foi possível carregar sua organização</h1>
          <p className="text-sm text-muted-foreground">Atualize a página e tente novamente.</p>
          <button className="text-sm underline" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
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
          <Route path="/" element={<Navigate to="/inicio" replace />} />
          <Route path="/inicio" element={<InicioPage />} />
          <Route path="/casos" element={<CasesPage />} />
          <Route path="/casos/novo" element={<CaseFormPage />} />
          <Route path="/casos/:id" element={<CaseDetailPage />} />
          <Route path="/casos/:id/editar" element={<CaseFormPage />} />
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/pacientes/:id" element={<PatientDetailPage />} />
          <Route path="/cadastros" element={<ReferencePage />} />
          <Route path="/cadastros/:type/:id" element={<EntityFichaPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/membros" element={<MembersPage />} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </AppLayout>
    </div>
  );
}
