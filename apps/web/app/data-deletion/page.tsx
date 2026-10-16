/** Public status page Meta links people to after a data deletion request. Deletion happens immediately. */
export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams
  return (
    <main className="mx-auto max-w-lg px-4 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Data deletion</h1>
      <p className="mt-3 text-muted-foreground">
        Your Instagram connection and all messages Reachly stored from it have been deleted.
        {code && (
          <>
            {" "}Confirmation code: <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">{code.replace(/[^a-f0-9]/gi, "")}</code>
          </>
        )}
      </p>
    </main>
  )
}
