import { ComingSoon } from "@/components/ComingSoon";
import { useT } from "@/i18n";

export default function CartScreen() {
  const t = useT();
  return <ComingSoon title={t("tabCart")} icon="cart" />;
}
