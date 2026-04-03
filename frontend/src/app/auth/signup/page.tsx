'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { createClient } from "@/utils/supabase";

export default function Signup() {
  const router = useRouter();
  const supabase = createClient();

  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Form Data State
  const [fullname, setFullname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    // 1. Pre-flight checks
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters");
      setIsLoading(false);
      return;
    }

    try {
      // 2. Create the secure user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullname, // <--- THIS SAVES IT TO AUTH METADATA
          },
        },
      });

      if (authError) throw authError;

      if (authData.user) {
        // 3. Create the public profile row linked to this new user
        const { error: profileError } = await supabase
          .from("profiles")
          .insert([
            { 
              id: authData.user.id, 
              email: authData.user.email,
              full_name: fullname
            }
          ]);

        if (profileError) throw profileError;

        // 4. Success! Redirect to login (or directly to the interview dashboard)
        alert("Account created successfully!");
        router.push("/auth/login");
      }
    } catch (error: any) {
      console.error("Signup failed:", error.message);
      setErrorMsg(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0a0f] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: "2s" }}></div>
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-purple-700 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-float" style={{ animationDelay: "4s" }}></div>

      <div className="relative z-10 w-full flex justify-center mb-12">
        <div className="flex items-center gap-3 animate-fade-in cursor-pointer" onClick={() => router.push('/login')}>
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <span className="text-white font-bold text-lg">AI</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">InterviewAR</h1>
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        <div className="backdrop-blur-sm bg-gradient-to-br from-purple-500/5 to-pink-500/5 border border-white/10 rounded-2xl p-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
              Create Account
            </h2>
            <p className="text-gray-400 text-sm">
              Join InterviewAR to get started
            </p>
          </div>

          {/* Added Error Banner here */}
          {errorMsg && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-500 text-sm text-center">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="fullname" className="block text-sm font-medium text-white mb-2">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                <input
                  id="fullname"
                  type="text"
                  value={fullname}
                  onChange={(e) => setFullname(e.target.value)}
                  required
                  placeholder="John Doe"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmpassword" className="block text-sm font-medium text-white mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
                <input
                  id="confirmpassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3.5 text-gray-500 hover:text-gray-400 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="terms"
                type="checkbox"
                required
                className="w-4 h-4 bg-white/5 border border-white/20 rounded accent-purple-500 cursor-pointer"
              />
              <label htmlFor="terms" className="text-sm text-gray-400 cursor-pointer">
                I agree to the Terms of Service and Privacy Policy
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-white text-black font-semibold rounded-lg hover:bg-gray-100 active:bg-gray-200 disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 mt-6"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gradient-to-br from-purple-500/5 to-pink-500/5 text-gray-500">
              </span>
            </div>
          </div>

          <p className="text-center text-sm text-gray-400">
            Already have an account?{" "}
            <button
              onClick={() => router.push('/auth/login')}
              className="text-purple-400 hover:text-purple-300 font-semibold transition-colors bg-none border-none cursor-pointer"
            >
              Sign in here
            </button>
          </p>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          By creating an account, you agree to our{" "}
          <a href="#" className="text-gray-500 hover:text-gray-400 underline">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="#" className="text-gray-500 hover:text-gray-400 underline">
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}