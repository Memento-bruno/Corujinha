import { AjustesView } from "@/components/ajustes/ajustes-view";
import { signOutAction } from "./actions";

export default function Page() {
  return <AjustesView signOutAction={signOutAction} />;
}
