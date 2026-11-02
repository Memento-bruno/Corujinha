import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BiometricLock } from "@/lib/lock";
import { SessionProvider, useSession } from "@/lib/session";

export { ErrorBoundary } from "expo-router";

function Gate() {
  const { ready, session } = useSession();
  const segments = useSegments();
  if (!ready) return null;

  const onLogin = segments[0] === "login";
  if (!session && !onLogin) return <Redirect href="/login" />;
  if (session && onLogin) return <Redirect href="/" />;

  const stack = (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="conectar" options={{ presentation: "modal", title: "Conectar cartão" }} />
    </Stack>
  );
  return session ? <BiometricLock>{stack}</BiometricLock> : stack;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Gate />
    </SessionProvider>
  );
}
