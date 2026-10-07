/** Renew credentials before this call. Both checks must settle before entering the app. */
export async function checkSessionAndAccess(verifySession: () => Promise<void>, loadAccess: () => Promise<void>) {
    const results = await Promise.allSettled([
        Promise.resolve().then(verifySession), Promise.resolve().then(loadAccess),
    ]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
}
