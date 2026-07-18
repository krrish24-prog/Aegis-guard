import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield, ShieldCheck, Lock, Mail, Eye, EyeOff, Globe, UserPlus,
  AlertTriangle, ChevronLeft, ChevronRight, X, KeyRound,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type Step = 'email' | 'password';

export interface LoginScreenProps {
  onGoogleLogin: () => void;
  onEmailAuth: (email: string, pass: string, isSignUp: boolean) => void;
  onForgotPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  isLoggingIn: boolean;
  error: string | null;
}

const inputCls =
  'w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/10 transition-all';

const ForgotPasswordModal = ({
  isOpen,
  onClose,
  initialEmail,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialEmail: string;
  onSubmit: (email: string) => Promise<{ success: boolean; message: string }>;
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setEmail(initialEmail);
      setFeedback(null);
    }
  }, [isOpen, initialEmail]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setFeedback(null);
    const result = await onSubmit(email.trim());
    setFeedback({ type: result.success ? 'success' : 'error', text: result.message });
    setSending(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 bg-emerald-600 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-white" />
                <h3 className="text-lg font-bold text-white">Reset Password</h3>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <form onSubmit={handleSend} className="p-6 space-y-4">
              <p className="text-sm text-zinc-400">
                Enter your email and we&apos;ll send a reset link.
              </p>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={inputCls}
                  required
                  autoFocus
                />
              </div>
              {feedback && (
                <div
                  className={cn(
                    'p-3 rounded-xl text-sm flex items-center gap-2',
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400',
                  )}
                >
                  {feedback.type === 'success' ? (
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  {feedback.text}
                </div>
              )}
              <button
                type="submit"
                disabled={sending}
                className="w-full py-3.5 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Send Reset Link'
                )}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const BrandPanel = () => (
  <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-zinc-950">
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-zinc-950 to-zinc-950" />
    <div className="absolute top-1/4 -left-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-glow" />
    <div className="absolute bottom-1/4 -right-10 w-60 h-60 bg-emerald-500/5 rounded-full blur-3xl" />
    <div className="relative z-10 flex flex-col justify-center px-16 py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl shadow-emerald-500/30 glow-emerald mb-8 border border-emerald-400/30"
      >
        <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-contain" />
      </motion.div>
      <h1 className="text-4xl font-bold text-white tracking-tight mb-3">Aegis Guard</h1>
      <p className="text-zinc-400 text-lg mb-10 max-w-sm">
        Military-grade end-to-end encryption for secure communication.
      </p>
      <div className="space-y-5">
        {[
          { icon: ShieldCheck, label: 'End-to-End Encrypted', desc: 'Messages readable only by you and recipients' },
          { icon: Lock, label: 'Zero Knowledge', desc: 'We never have access to your keys or content' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{label}</p>
              <p className="text-zinc-500 text-sm">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function LoginScreen({
  onGoogleLogin,
  onEmailAuth,
  onForgotPassword,
  isLoggingIn,
  error,
}: LoginScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const goToPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStep('password');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    onEmailAuth(email, password, isSignUp);
  };

  const resetFlow = () => {
    setStep('email');
    setPassword('');
  };

  const steps: Step[] = ['email', 'password'];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="flex min-h-screen bg-zinc-950">
      <BrandPanel />

      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile branding */}
          <div className="lg:hidden flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl overflow-hidden shadow-lg shadow-emerald-500/20 glow-emerald border border-emerald-400/30">
              <img src="/app-logo.png" alt="Aegis Guard" className="w-full h-full object-contain" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white">Aegis Guard</h1>
              <p className="text-zinc-500 text-sm">Secure encrypted messaging</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    i <= stepIndex
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'bg-zinc-800 text-zinc-500',
                  )}
                >
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 rounded-full transition-all',
                      i < stepIndex ? 'bg-emerald-500' : 'bg-zinc-800',
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 p-8 rounded-[2rem] space-y-6 shadow-2xl">
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-bold text-white">
                {step === 'email'
                  ? isSignUp ? 'Create Account' : 'Welcome Back'
                  : isSignUp ? 'Set Password' : 'Enter Password'}
              </h2>
              <p className="text-zinc-500 text-sm">
                {step === 'email'
                  ? isSignUp ? 'Enter your email to get started.' : 'Sign in with your email address.'
                  : `Continuing as ${email}`}
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm"
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {step === 'email' ? (
                <motion.div
                  key="email-step"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <form onSubmit={goToPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">
                        Email Address
                      </label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@example.com"
                          className={inputCls}
                          required
                          autoFocus
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      Continue
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </form>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-800" />
                    </div>
                    <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-widest">
                      <span className="bg-zinc-900/50 px-4 text-zinc-500">Or</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onGoogleLogin}
                    disabled={isLoggingIn}
                    className="w-full py-4 bg-zinc-950 border border-zinc-800 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    <Globe className="w-5 h-5 text-emerald-500" />
                    Continue with Google
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="password-step"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          Password
                        </label>
                        {!isSignUp && (
                          <button
                            type="button"
                            onClick={() => setShowForgotModal(true)}
                            className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 hover:text-emerald-400 transition-colors"
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 group-focus-within:text-emerald-500 transition-colors" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className={cn(inputCls, 'pr-12')}
                          required
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="py-4 px-5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded-2xl font-bold hover:bg-zinc-800 hover:text-white transition-all"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button
                        type="submit"
                        disabled={isLoggingIn}
                        className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                      >
                        {isLoggingIn ? (
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : isSignUp ? (
                          <UserPlus className="w-5 h-5" />
                        ) : (
                          <Lock className="w-5 h-5" />
                        )}
                        {isSignUp ? 'Create Account' : 'Sign In'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); resetFlow(); }}
                className="text-zinc-500 text-sm hover:text-white transition-colors"
              >
                {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                <span className="text-emerald-500 font-bold">{isSignUp ? 'Sign In' : 'Create One'}</span>
              </button>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 text-center leading-relaxed px-4">
            By continuing, you agree to Aegis Guard&apos;s secure communication protocols.
          </p>
        </div>
      </div>

      <ForgotPasswordModal
        isOpen={showForgotModal}
        onClose={() => setShowForgotModal(false)}
        initialEmail={email}
        onSubmit={onForgotPassword}
      />
    </div>
  );
}
