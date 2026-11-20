import { useCallback, useEffect, useRef, useState } from "react";
import { Language } from "../services/i18n";
import {
  DEFAULT_TASKBAR_PRO_STATUS,
  TaskbarProStatus,
  getTaskbarProStatus,
  purchaseTaskbarPro,
  refreshTaskbarProLicense,
  subscribeTaskbarProStatus,
} from "../services/taskbarProService";
import { ProPurchaseFeedback } from "../components/settingsWindow/navbar/TaskbarProBanner";

export function useGiliProLicense(optLanguage: Language) {
  const isId = optLanguage === "id";
  const [proStatus, setProStatus] = useState<TaskbarProStatus>(DEFAULT_TASKBAR_PRO_STATUS);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRefreshingLicense, setIsRefreshingLicense] = useState(false);
  const [proFeedback, setProFeedback] = useState<ProPurchaseFeedback | null>(null);
  const [bannerPulse, setBannerPulse] = useState(false);
  const proBannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getTaskbarProStatus().then((status) => {
      if (active) setProStatus(status);
    });
    const unsubscribe = subscribeTaskbarProStatus((nextStatus) => {
      if (active) setProStatus(nextStatus);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handlePurchasePro = useCallback(
    async (onUnlocked?: () => unknown) => {
      if (isPurchasing) return;
      setIsPurchasing(true);
      setProFeedback(null);
      try {
        const outcome = await purchaseTaskbarPro();
        if (outcome.licenseStatus) {
          setProStatus(outcome.licenseStatus);
        }
        if (outcome.status === "succeeded" || outcome.status === "already_purchased") {
          setProFeedback({ kind: "success", message: outcome.message });
          if (onUnlocked) {
            await onUnlocked();
          }
        } else if (outcome.status === "cancelled") {
          setProFeedback({ kind: "info", message: outcome.message });
        } else if (outcome.status !== "not_required") {
          setProFeedback({ kind: "error", message: outcome.message });
        }
      } catch (err) {
        setProFeedback({
          kind: "error",
          message: isId
            ? `Gagal memproses pembelian: ${String(err)}`
            : `Failed to start Store purchase: ${String(err)}`,
        });
      } finally {
        setIsPurchasing(false);
      }
    },
    [isId, isPurchasing]
  );

  const handleRefreshLicense = useCallback(
    async (onUnlocked?: () => unknown) => {
      if (isRefreshingLicense || isPurchasing) return;
      setIsRefreshingLicense(true);
      setProFeedback(null);
      try {
        const status = await refreshTaskbarProLicense();
        setProStatus(status);
        if (!status.isLocked) {
          setProFeedback({
            kind: "success",
            message: isId
              ? "Lisensi Gili Pro ditemukan dan aktif untuk Taskbar, StandBy, serta Widget Desktop."
              : "Gili Pro license verified and active for Taskbar, StandBy, and Desktop Widgets.",
          });
          if (onUnlocked) {
            await onUnlocked();
          }
        } else {
          setProFeedback({
            kind: "info",
            message:
              status.lastError ||
              (isId
                ? "Belum ada pembelian Gili Pro yang aktif di akun Microsoft Store ini."
                : "No active Gili Pro license was found on this Microsoft Store account."),
          });
        }
      } catch (err) {
        setProFeedback({
          kind: "error",
          message: String(err),
        });
      } finally {
        setIsRefreshingLicense(false);
      }
    },
    [isId, isPurchasing, isRefreshingLicense]
  );

  const promptProUpgrade = useCallback(
    (onUnlocked?: () => unknown) => {
      proBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setBannerPulse(true);
      window.setTimeout(() => setBannerPulse(false), 1200);
      handlePurchasePro(onUnlocked);
    },
    [handlePurchasePro]
  );

  return {
    proStatus,
    isProLocked: proStatus.isLocked,
    isPurchasing,
    isRefreshingLicense,
    proFeedback,
    bannerPulse,
    proBannerRef,
    handlePurchasePro,
    handleRefreshLicense,
    promptProUpgrade,
  };
}
