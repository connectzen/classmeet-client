import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { insforge } from './insforge';

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
}

const AuthContext = createContext<AuthContextValue>({ user: null, isLoaded: false });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        insforge.auth.getCurrentUser().then(({ data }) => {
            setUser((data?.user as AuthUser) ?? null);
            setIsLoaded(true);
        }).catch(() => {
            setUser(null);
            setIsLoaded(true);
        });
    }, []);

    return (
        <AuthContext.Provider value={{ user, isLoaded }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useUser() {
    return useContext(AuthContext);
}
