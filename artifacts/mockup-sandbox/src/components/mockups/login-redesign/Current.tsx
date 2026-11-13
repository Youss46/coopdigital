import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./_group.css";

export function Current() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="min-h-screen bg-white px-8 py-10 text-[#1f2937]">
      <div className="mx-auto flex min-h-[790px] w-full max-w-sm flex-col justify-center">
        <div className="mb-8 flex justify-center">
          <img
            src="/__mockup/images/coopdigital-logo.png"
            alt="CoopDigital"
            className="h-20 w-20 rounded-2xl object-contain shadow-lg"
          />
        </div>

        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-[#1a4731]">Connexion</h1>
          <p className="text-base text-gray-500">Accédez à votre espace CoopDigital</p>
        </header>

        <form className="space-y-4" onSubmit={(event) => event.preventDefault()}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">Adresse email</span>
            <span className="relative block">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-gray-400">✉️</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@coopdigital.ci"
                autoComplete="email"
                className="w-full rounded-xl border-2 border-gray-200 py-3.5 pl-10 pr-4 text-base outline-none transition-colors focus:border-[#1a4731]"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">Mot de passe</span>
            <span className="relative block">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-gray-400">🔒</span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border-2 border-gray-200 py-3.5 pl-10 pr-12 text-base outline-none transition-colors focus:border-[#1a4731]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          <button
            type="submit"
            className="mt-2 flex w-full items-center justify-center gap-3 rounded-xl bg-[#1a4731] py-4 text-base font-bold text-white shadow-lg shadow-[#1a4731]/20"
          >
            SE CONNECTER <span aria-hidden="true">→</span>
          </button>

          <div className="my-1 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-xs font-medium text-gray-400">OU</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#1a4731] py-3.5 text-base font-bold text-[#1a4731]"
          >
            Empreinte digitale / Face ID
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="mb-2 text-sm text-gray-500">Vous êtes agent terrain ?</p>
          <a href="#" className="text-sm font-semibold text-[#1a4731]">
            Accéder à l'interface terrain →
          </a>
        </div>

        <footer className="mt-10 border-t border-gray-100 pt-6 text-center">
          <p className="text-xs text-gray-400">CoopDigital — M15 Tech, Yamoussoukro</p>
          <p className="mt-1 text-xs text-gray-400">Support : 0714174082 · contacteyouss@gmail.com</p>
        </footer>
      </div>
    </main>
  );
}
