const value = process.env.DATABASE_URL || '';
if (!value) {
  console.log(JSON.stringify({ present: false }, null, 2));
  process.exit(0);
}

try {
  const url = new URL(value);
  console.log(JSON.stringify({
    present: true,
    protocol: url.protocol,
    hostPresent: Boolean(url.hostname),
    portPresent: Boolean(url.port),
    pathPresent: Boolean(url.pathname && url.pathname !== '/'),
    sslmode: url.searchParams.get('sslmode'),
    hasSslParam: url.searchParams.has('ssl'),
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    present: true,
    parseable: false,
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
}
