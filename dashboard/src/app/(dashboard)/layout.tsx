import type { ReactNode } from 'react';
import { Shell } from '../../components/shell/Shell';

export default function DashboardLayout({ children }: { children: ReactNode }): React.JSX.Element {
  return <Shell>{children}</Shell>;
}
