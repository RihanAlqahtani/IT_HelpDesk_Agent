/**
 * Global State Store
 *
 * Uses Zustand for lightweight state management.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  permissions: string[];
}

interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: true,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setLoading: (isLoading) => set({ isLoading }),

      logout: () => {
        set({ user: null, session: null });
      },

      isAuthenticated: () => {
        const { session } = get();
        if (!session) return false;
        // Check if token is expired
        return session.expiresAt * 1000 > Date.now();
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
      }),
    }
  )
);

// Ticket state
interface TicketState {
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
}

export const useTicketStore = create<TicketState>((set) => ({
  selectedTicketId: null,
  setSelectedTicketId: (id) => set({ selectedTicketId: id }),
}));
