import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getTenant, getTenantStatus, deployTenant, changePassword } from "@/api";
import { Rocket } from "lucide-react";

export function SettingsPage() {
  const { t } = useTranslation();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    getTenant(tenantId).then(setTenant).catch(() => {});
    getTenantStatus(tenantId).then(setStatus).catch(() => {});
  }, [tenantId]);

  const handleDeploy = async () => {
    if (!tenantId) return;
    setDeploying(true); setDeployMsg("");
    try { await deployTenant(tenantId); setDeployMsg(t("settings.deploySuccess")); setTimeout(() => setDeployMsg(""), 3000); getTenantStatus(tenantId).then(setStatus).catch(() => {}); }
    catch { setDeployMsg(t("settings.deployFailed")); }
    finally { setDeploying(false); }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(""); setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setPasswordError(t("settings.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError(t("settings.passwordTooShort"));
      return;
    }
    if (!tenantId) return;
    setChangingPassword(true);
    try {
      const result = await changePassword(tenantId, currentPassword, newPassword);
      if (result.success) {
        setPasswordMsg(t("settings.passwordChanged"));
        setTimeout(() => setPasswordMsg(""), 3000);
        setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      } else {
        setPasswordError(result.error || t("settings.passwordFailed"));
      }
    } catch {
      setPasswordError(t("settings.passwordFailed"));
    } finally {
      setChangingPassword(false);
    }
  };

  if (!tenant) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;

  return (
    <div className="p-8 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t("settings.title")}</h1>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("settings.subdomain")}</h2>
        <div className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50">
          <span className="font-mono text-gray-700">{tenant.subdomain}.vibeweb.localhost</span>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("settings.deploy")}</h2>
        <p className="text-sm text-gray-400 mb-3">
          {t("settings.deployDesc")}
          {status?.last_deployment && <span className="text-gray-500"> {t("settings.lastDeploy", { date: new Date(status.last_deployment).toLocaleString() })}</span>}
        </p>
        <button onClick={handleDeploy} disabled={deploying}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-colors">
          <Rocket className="w-4 h-4" />{deploying ? t("settings.deploying") : t("settings.deployToLive")}
        </button>
        {deployMsg && <p className="mt-2 text-sm text-emerald-600">{deployMsg}</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("settings.changePassword")}</h2>
        <form onSubmit={handleChangePassword} className="space-y-3 max-w-sm">
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-gray-500 mb-1">{t("settings.currentPassword")}</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t("settings.currentPasswordPlaceholder")}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-gray-500 mb-1">{t("settings.newPassword")}</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("settings.newPasswordPlaceholder")}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-gray-500 mb-1">{t("settings.confirmNewPassword")}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("settings.confirmNewPasswordPlaceholder")}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
            />
          </div>
          {passwordError && <p className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{passwordError}</p>}
          {passwordMsg && <p className="text-sm text-emerald-600">{passwordMsg}</p>}
          <button
            type="submit"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-500 disabled:opacity-40 transition-colors"
          >
            {changingPassword ? t("settings.changingPassword") : t("settings.changePassword")}
          </button>
        </form>
      </section>
    </div>
  );
}
