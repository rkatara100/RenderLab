let epoch = 0;
let scheduled = false;

export function currentCommitEpoch(): number {
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      epoch += 1;
    });
  }
  return epoch;
}
