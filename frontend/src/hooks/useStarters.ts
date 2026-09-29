import { useEffect } from "react";
import { api } from "../lib/api";
import { useAppState } from "../lib/AppState";
import { learningExperience } from "../lib/state";

/** Shown to new learners, and whenever personal starters aren't available. */
export const GENERAL_STARTERS = [
  "Explain recursion with one tiny example I can run",
  "Why does my for loop skip the last item?",
  "Quiz me with three quick questions on Python lists",
  "What should a beginner learn after loops?",
];

// One request per learner and learning level at a time, even if the welcome screen re-renders.
const inFlight = new Set<string>();

/**
 * Starter questions for a new chat. Personal ones come from the learner's notes on the server;
 * they're saved in the browser and only rebuilt after the learner has had new answers, so opening
 * a new chat doesn't ask the model every time. Until they arrive, the previous set (or the general
 * starters) is shown.
 */
export function useStarters(memoryOn: boolean): { items: string[]; personal: boolean } {
  const { state, dispatch } = useAppState();
  const { learnerId, showSuggestions } = state.settings;
  const experience = learningExperience(state.conversations);
  const cache = state.starters?.learnerId === learnerId ? state.starters : null;
  const enabled = memoryOn && showSuggestions;
  const upToDate = cache?.experience === experience;

  useEffect(() => {
    const key = `${learnerId}:${experience}`;
    if (!enabled || upToDate || inFlight.has(key)) return;
    inFlight.add(key);
    api
      .starters(learnerId)
      .then((items) =>
        dispatch({ type: "setStarters", starters: { learnerId, experience, items, createdAt: Date.now() } }),
      )
      .catch(() => {
        // A bonus, not a feature: on failure the general starters stay.
      })
      .finally(() => inFlight.delete(key));
  }, [enabled, upToDate, learnerId, experience, dispatch]);

  const personal = enabled && Boolean(cache?.items.length);
  return { items: personal ? cache!.items : GENERAL_STARTERS, personal };
}
