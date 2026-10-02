import { redirect } from 'next/navigation';

/** Nav Dashboard is `/`; keep `/dashboard` as an alias. */
export default function DashboardAliasPage() {
  redirect('/');
}
