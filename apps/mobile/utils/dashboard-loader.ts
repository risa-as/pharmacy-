/** Independent sections render when ready; the caller guards account/scope changes. */
export async function loadDashboardSections<A, B>(
    primary: () => Promise<A>, secondary: () => Promise<B>,
    onPrimary: (value: A) => void, onSecondary: (value: B) => void,
    onPrimaryError: () => void, onSecondaryError: () => void,
    onPrimarySettled: () => void,
) {
    await Promise.all([
        Promise.resolve().then(primary).then(onPrimary, onPrimaryError).finally(onPrimarySettled),
        Promise.resolve().then(secondary).then(onSecondary, onSecondaryError),
    ]);
}
