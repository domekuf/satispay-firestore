import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import type { TenantRole } from '@muvat/shared';

interface AuthState {
  user: User | null;
  tenantId: string | null;
  role: TenantRole | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    tenantId: null,
    role: null,
    token: null,
    loading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ user: null, tenantId: null, role: null, token: null, loading: false });
        return;
      }

      // Force-refresh to get latest custom claims.
      // After registration the server sets claims via firebase-admin; Firebase may need
      // a moment to propagate them, so retry once after a short delay if missing.
      let idTokenResult = await firebaseUser.getIdTokenResult(true);
      if (!idTokenResult.claims['tenantId']) {
        await new Promise((r) => setTimeout(r, 2000));
        idTokenResult = await firebaseUser.getIdTokenResult(true);
      }

      setState({
        user: firebaseUser,
        tenantId: (idTokenResult.claims['tenantId'] as string) ?? null,
        role: (idTokenResult.claims['role'] as TenantRole) ?? null,
        token: idTokenResult.token,
        loading: false,
      });
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
