import { FormEvent, type ReactNode, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient";

type RecoveryStep = "closed" | "request" | "verify" | "reset" | "done";
type StatusType = "idle" | "info" | "error" | "success";

type PasswordRecoveryEntryPointProps = {
  children: ReactNode;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAuthRedirectUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export default function PasswordRecoveryEntryPoint({
  children,
}: PasswordRecoveryEntryPointProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<RecoveryStep>("closed");
  const [email, setEmail] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [statusType, setStatusType] = useState<StatusType>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      // Keep clickable recovery links as a fallback even though the primary
      // Customer Liaison-style flow uses a manually entered email code.
      if (event === "PASSWORD_RECOVERY" && nextSession) {
        setStep("reset");
        setStatusType("info");
        setStatusMessage("Recovery verified. Choose a new password.");
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  function resetStatus() {
    setStatusType("idle");
    setStatusMessage("");
  }

  function openRecovery() {
    setStep("request");
    setEmail("");
    setRecoveryEmail("");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    resetStatus();
  }

  async function cancelRecovery() {
    if (step === "reset") {
      await supabase.auth.signOut();
    }
    setStep("closed");
    setCode("");
    setPassword("");
    setConfirmPassword("");
    resetStatus();
  }

  async function requestRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setStatusType("error");
      setStatusMessage("Enter a valid email address.");
      return;
    }

    setBusy(true);
    setStatusType("info");
    setStatusMessage("Sending recovery code…");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        normalizedEmail,
        { redirectTo: getAuthRedirectUrl() },
      );
      if (error) throw error;

      setRecoveryEmail(normalizedEmail);
      setCode("");
      setStep("verify");
      setStatusType("success");
      setStatusMessage(
        "If an account exists for this email address, a recovery code has been sent. Enter the complete newest code from the email.",
      );
    } catch (error: unknown) {
      const authError = error as { status?: number; code?: string; message?: string };
      const rateLimited =
        authError.status === 429 || authError.code === "over_email_send_rate_limit";
      setStatusType("error");
      setStatusMessage(
        rateLimited
          ? "Too many recovery emails were requested. Wait before requesting another code, then try once."
          : authError.message || "The recovery email could not be sent right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = code.trim();
    if (!/^\d{6,10}$/.test(token)) {
      setStatusType("error");
      setStatusMessage("Enter the complete recovery code from the email (6 to 10 digits).");
      return;
    }

    if (!isValidEmail(recoveryEmail)) {
      setStep("request");
      setStatusType("error");
      setStatusMessage("Request a new recovery code first.");
      return;
    }

    setBusy(true);
    setStatusType("info");
    setStatusMessage("Verifying recovery code…");

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: recoveryEmail,
        token,
        type: "recovery",
      });
      if (error) throw error;
      if (!data.session) throw new Error("No recovery session was created.");

      setSession(data.session);
      setCode("");
      setStep("reset");
      setStatusType("success");
      setStatusMessage("Recovery code verified. Choose a new password.");
    } catch {
      setStatusType("error");
      setStatusMessage(
        "The recovery code is invalid or expired. Use the newest code, or request a new one.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 6) {
      setStatusType("error");
      setStatusMessage("Use a password with at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatusType("error");
      setStatusMessage("The two password entries do not match.");
      return;
    }

    setBusy(true);
    setStatusType("info");
    setStatusMessage("Updating password…");

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPassword("");
      setConfirmPassword("");
      setStep("done");
      setStatusType("success");
      setStatusMessage("Your password has been updated successfully.");
    } catch (error: unknown) {
      const authError = error as { message?: string };
      setStatusType("error");
      setStatusMessage(authError.message || "The password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {children}

      {!session && step === "closed" && (
        <button
          type="button"
          onClick={openRecovery}
          style={floatingButtonStyle}
          aria-label="Forgot password"
        >
          Forgot password?
        </button>
      )}

      {step !== "closed" && (
        <div style={backdropStyle} role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-recovery-title"
            style={dialogStyle}
          >
            <div style={dialogHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>Secure account recovery</div>
                <h2 id="password-recovery-title" style={titleStyle}>
                  {step === "request" && "Forgot your password?"}
                  {step === "verify" && "Verify recovery code"}
                  {step === "reset" && "Set a new password"}
                  {step === "done" && "Password updated"}
                </h2>
              </div>
              {step !== "done" && (
                <button
                  type="button"
                  onClick={() => void cancelRecovery()}
                  style={closeButtonStyle}
                  aria-label="Close password recovery"
                  disabled={busy}
                >
                  ×
                </button>
              )}
            </div>

            {statusType !== "idle" && (
              <div
                role={statusType === "error" ? "alert" : "status"}
                style={{
                  ...statusStyle,
                  ...(statusType === "error"
                    ? errorStatusStyle
                    : statusType === "success"
                      ? successStatusStyle
                      : infoStatusStyle),
                }}
              >
                {statusMessage}
              </div>
            )}

            {step === "request" && (
              <form onSubmit={requestRecoveryCode} style={formStyle}>
                <label style={labelStyle}>
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    maxLength={254}
                    style={inputStyle}
                  />
                </label>
                <button type="submit" disabled={busy} style={primaryButtonStyle}>
                  {busy ? "Sending…" : "Send Recovery Code"}
                </button>
              </form>
            )}

            {step === "verify" && (
              <form onSubmit={verifyRecoveryCode} style={formStyle}>
                <p style={helperTextStyle}>
                  Enter the complete newest recovery code sent to {recoveryEmail}.
                </p>
                <label style={labelStyle}>
                  Recovery code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    pattern="[0-9]*"
                    maxLength={10}
                    required
                    style={inputStyle}
                  />
                </label>
                <button type="submit" disabled={busy} style={primaryButtonStyle}>
                  {busy ? "Verifying…" : "Verify Code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(recoveryEmail);
                    setStep("request");
                    resetStatus();
                  }}
                  style={textButtonStyle}
                  disabled={busy}
                >
                  Request a new code
                </button>
              </form>
            )}

            {step === "reset" && (
              <form onSubmit={updatePassword} style={formStyle}>
                <label style={labelStyle}>
                  New password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Confirm new password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                    style={inputStyle}
                  />
                </label>
                <button type="submit" disabled={busy} style={primaryButtonStyle}>
                  {busy ? "Updating…" : "Update Password"}
                </button>
              </form>
            )}

            {step === "done" && (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={() => {
                  setStep("closed");
                  resetStatus();
                }}
              >
                Continue to the app
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
}

const floatingButtonStyle = {
  position: "fixed",
  right: "1rem",
  bottom: "1rem",
  zIndex: 60,
  border: "1px solid #94a3b8",
  borderRadius: "999px",
  padding: "0.65rem 0.95rem",
  background: "#ffffff",
  color: "#1e3a5f",
  fontWeight: 700,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
  cursor: "pointer",
} as const;

const backdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "grid",
  placeItems: "center",
  padding: "1rem",
  background: "rgba(15, 23, 42, 0.48)",
} as const;

const dialogStyle = {
  width: "min(100%, 34rem)",
  maxHeight: "calc(100vh - 2rem)",
  overflowY: "auto",
  borderRadius: "1rem",
  padding: "1.25rem",
  background: "#ffffff",
  color: "#0f172a",
  boxShadow: "0 24px 70px rgba(15, 23, 42, 0.28)",
} as const;

const dialogHeaderStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  marginBottom: "1rem",
} as const;

const eyebrowStyle = {
  color: "#31557e",
  fontSize: "0.72rem",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} as const;

const titleStyle = {
  margin: "0.25rem 0 0",
  color: "#17385f",
} as const;

const closeButtonStyle = {
  border: 0,
  background: "transparent",
  color: "#475569",
  fontSize: "1.75rem",
  lineHeight: 1,
  cursor: "pointer",
} as const;

const statusStyle = {
  marginBottom: "1rem",
  borderRadius: "0.75rem",
  padding: "0.75rem 0.85rem",
  fontSize: "0.9rem",
  lineHeight: 1.45,
} as const;

const infoStatusStyle = {
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e3a8a",
} as const;

const successStatusStyle = {
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
} as const;

const errorStatusStyle = {
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
} as const;

const formStyle = {
  display: "grid",
  gap: "0.9rem",
} as const;

const labelStyle = {
  display: "grid",
  gap: "0.35rem",
  color: "#1e293b",
  fontSize: "0.85rem",
  fontWeight: 700,
} as const;

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #94a3b8",
  borderRadius: "0.65rem",
  padding: "0.7rem 0.8rem",
  background: "#ffffff",
  color: "#0f172a",
  font: "inherit",
} as const;

const primaryButtonStyle = {
  border: 0,
  borderRadius: "0.65rem",
  padding: "0.72rem 1rem",
  background: "#294a70",
  color: "#ffffff",
  fontWeight: 800,
  cursor: "pointer",
} as const;

const textButtonStyle = {
  justifySelf: "start",
  border: 0,
  padding: 0,
  background: "transparent",
  color: "#31557e",
  textDecoration: "underline",
  cursor: "pointer",
} as const;

const helperTextStyle = {
  margin: 0,
  color: "#475569",
  fontSize: "0.85rem",
  lineHeight: 1.45,
} as const;
