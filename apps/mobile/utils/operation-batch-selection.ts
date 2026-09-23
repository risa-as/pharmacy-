/** New batches first; never overwrite a count or note already entered. */
export function prependOperationBatches(
  previous: Record<string, any>,
  batches: any[],
): Record<string, any> {
  const additions: Record<string, any> = {};
  for (const batch of batches) {
    if (!previous[batch.id] && !additions[batch.id])
      additions[batch.id] = {
        batch,
        systemQuantity: batch.quantity,
        actual: "",
        reason: "",
      };
  }
  return { ...additions, ...previous };
}
