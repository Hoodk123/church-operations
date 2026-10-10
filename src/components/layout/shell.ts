import { createContext, useContext } from 'react';

export interface ShellMember {
  id: string;
  full_name: string;
  role: string;
}

export const ShellContext = createContext<{ member: ShellMember | null }>({ member: null });

export function useShellMember(): ShellMember | null {
  return useContext(ShellContext).member;
}
