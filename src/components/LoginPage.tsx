import GoogleSignInButton from "./GoogleSignInButton";

export default function LoginPage() {
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="text-center">
        <div className="mb-8">
          <span className="text-5xl">🩹</span>
          <h1 className="text-3xl font-bold text-gray-800 mt-4">
            DuckTape EDA
          </h1>
          <p className="text-gray-500 mt-2">Hold your circuits together.</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg px-10 py-8 max-w-sm mx-auto">
          <p className="text-sm text-gray-600 mb-6">
            Sign in to start designing circuit boards with AI.
          </p>
          <GoogleSignInButton />
        </div>

        <p className="text-xs text-gray-400 mt-6">
          AI-powered PCB design for hobbyists
        </p>
      </div>
    </div>
  );
}
