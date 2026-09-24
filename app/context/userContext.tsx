import { createContext, useContext } from "react";

export type User = {
  id: string;
  username: string;
  // Registered vs. anonymous/agent — drives BRD-020's claim control (a
  // registered user can claim an ownerless board; an anonymous one is sent
  // to log in first). See ~/hooks/useAuth.
  is_anonymous: boolean;
};

const UserContext = createContext<User | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  return (
    <UserContext.Provider value={user}>
      {children}
    </UserContext.Provider>
  );
}

export function useOptionalUser() {
  return useContext(UserContext);
}

export function useUser() {
  const user = useContext(UserContext);

  if (!user) {
    throw new Error("useUser must be used within a UserProvider");
  }

  return user;
}
