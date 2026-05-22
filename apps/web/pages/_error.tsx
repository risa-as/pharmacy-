/**
 * Custom Pages Router error page.
 * This file exists solely to prevent Next.js from prerendering its internal
 * default _error page during `next build`, which causes a React hooks
 * instance-mismatch error ("Cannot read properties of null (reading 'useContext')").
 * The App Router handles all real errors via app/not-found.tsx and error.tsx.
 */
function ErrorPage({ statusCode }: { statusCode?: number }) {
    return (
        <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
            <h1>{statusCode ?? 'Client'} Error</h1>
        </div>
    );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode: number }; err?: { statusCode: number } }) => {
    const statusCode = res?.statusCode ?? err?.statusCode ?? 500;
    return { statusCode };
};

export default ErrorPage;
