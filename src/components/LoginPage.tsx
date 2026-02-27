import GoogleSignInButton from "./GoogleSignInButton";

export default function LoginPage() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/login-bg.jpg')" }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        <div className="mb-10">
          <h1 className="text-5xl font-bold text-white tracking-tight">
            DuckTape EDA
          </h1>
          <p className="text-cyan-300/80 text-lg mt-2 font-light tracking-wide">
            Hold your circuits together.
          </p>
        </div>

        <div className="backdrop-blur-md bg-white/10 border border-white/20 rounded-2xl px-10 py-8 max-w-sm mx-auto shadow-2xl">
          <p className="text-sm text-gray-200 mb-6">
            Sign in to start designing circuit boards with AI.
          </p>
          <GoogleSignInButton />
        </div>

        <p className="text-xs text-gray-400/60 mt-8 tracking-wider uppercase">
          AI-powered PCB design for hobbyists
        </p>
      </div>
    </div>
  );
}
