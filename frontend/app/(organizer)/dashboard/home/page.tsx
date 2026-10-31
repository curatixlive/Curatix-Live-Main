import { redirect } from 'next/navigation';

/**
 * The organiser dashboard has no attendee landing page inside it.
 *
 * This route used to render the PUBLIC home page under the dashboard shell, so
 * an organiser pressing "Home" saw event posters, save buttons and a "Featured
 * events" rail inside their own console. The organiser portal and the attendee
 * site are two separate products: anyone who bookmarked this URL lands on the
 * organiser overview instead.
 */
export default function DashboardHomeRedirect(): never {
  redirect('/dashboard');
}
