import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

export default function NotFound() {
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      router.dismissTo("/");
    }, [router])
  );
  return null;
}
