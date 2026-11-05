import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { LogoMark, Waves } from "../components/Logo";
import { Button, ErrorBox, Field, Input } from "../components/ui";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (user) return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-abyss-800 via-abyss-900 to-abyss-950 px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <Waves className="h-40 sm:h-56" />

      <div className="relative mb-8 flex flex-col items-center text-center">
        <LogoMark className="size-16 drop-shadow-[0_8px_24px_rgba(0,184,240,0.45)]" />
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white">Hydro</h1>
        <p className="mt-1 text-sm text-abyss-300">Inventory &amp; invoicing that flows</p>
      </div>

      <form onSubmit={submit} className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl shadow-abyss-950/50 sm:p-8">
        <h2 className="mb-5 text-lg font-semibold text-abyss-900">Sign in</h2>
        <div className="space-y-4">
          <Field label="Email">
            {(id) => (
              <Input id={id} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            )}
          </Field>
          <Field label="Password">
            {(id) => (
              <div className="relative">
                <Input
                  id={id}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            )}
          </Field>
          <ErrorBox error={error} />
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
