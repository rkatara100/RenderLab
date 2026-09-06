import { create } from 'zustand';

export type ReplaySpeed = 0.5 | 1 | 2 | 4;
export type ReplayStatus = 'paused' | 'playing';

interface ReplayState {
  status: ReplayStatus;
  cursorIndex: number;
  speed: ReplaySpeed;
}

interface ReplayActions {
  play: () => void;
  pause: () => void;
  setSpeed: (speed: ReplaySpeed) => void;
  setCursorIndex: (cursorIndex: number) => void;
  advanceCursor: (frameCount: number) => void;
  reset: () => void;
}

const initialState: ReplayState = {
  status: 'paused',
  cursorIndex: 0,
  speed: 1,
};

export const useReplayStore = create<ReplayState & ReplayActions>((set) => ({
  ...initialState,
  play: () => set({ status: 'playing' }),
  pause: () => set({ status: 'paused' }),
  setSpeed: (speed) => set({ speed }),
  setCursorIndex: (cursorIndex) => set({ cursorIndex }),
  advanceCursor: (frameCount) =>
    set((state) => {
      const next = state.cursorIndex + 1;
      if (next >= frameCount) return { cursorIndex: frameCount - 1, status: 'paused' };
      return { cursorIndex: next };
    }),
  reset: () => set(initialState),
}));
