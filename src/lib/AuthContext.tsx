import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { insforge } from './insforge';
import { resubscribeForUser } from './pushSubscription';

interface UserProfile {
    name?: string;
    avatar_url?: string | null;
    [key: string]: unknown;
}

export interface AuthUser {
    id: string;
    email: string;
    emailVerified?: boolean;
    providers?: string[];
    profile: UserProfile;
    metadata?: Record<string, unknown>;
}

interface AuthContextValue {
    user: AuthUser | null;
    isLoaded: boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ user: null, isLoaded: false, refreshUser: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const refreshUser = useCallback(async () => {
        const { data } = await insforge.auth.getCurrentUser().catch(() => ({ data: null }));
        setUser((data?.user as AuthUser) ?? null);
    }, []);

    useEffect(() => {
        insforge.auth.getCurrentUser().then(({ data }) => {
            const u = (data?.user as AuthUser) ?? null;
            setUser(u);
            setIsLoaded(true);
            // Re-associate push subscription with the logged-in user
            if (u?.id) resubscribeForUser(u.id).catch(() => {});
        }).catch(() => {
            setUser(null);
            setIsLoaded(true);
        });
    }, []);

    // Refetch current user when tab becomes visible (e.g. profile/avatar updated elsewhere)
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            refreshUser().catch(() => {});
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refreshUser]);

    return (
        <AuthContext.Provider value={{ user, isLoaded, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useUser() {
    return useContext(AuthContext);
}
