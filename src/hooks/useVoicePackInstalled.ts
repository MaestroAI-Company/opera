import { useEffect, useState } from "react";
import { NEURAL_ENGINES, subscribeInstall, supportedEngineIds } from "../services/speech/engines";

//true once the voice pack is on disk
export function useVoicePackInstalled(): boolean {
  const id = supportedEngineIds()[0];
  const [installed, setInstalled] = useState(() => !!id && NEURAL_ENGINES[id].isInstalled());

  useEffect(
    () =>
      subscribeInstall((engineId, snapshot) => {
        if (engineId === id && !snapshot) setInstalled(NEURAL_ENGINES[id].isInstalled());
      }),
    [id],
  );

  return installed;
}
