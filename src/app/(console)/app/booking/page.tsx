import { requireAuth, hasPermission } from "@/server/rbac/authorize";
import { ComingSoon, Forbidden } from "@/components/console/ui";

export default async function BookingPage() {
  const auth = await requireAuth();
  if (!hasPermission(auth, "booking.view")) return <Forbidden />;
  return <ComingSoon module="Booking" />;
}
