import fs from 'fs';

const baseUrl = process.env.RELGRAPH_QA_BASE_URL || 'https://5000-i7zs9ijy9dpiq0wx6acsg-f2432de1.sg1.manus.computer';
const email = process.env.RELGRAPH_QA_EMAIL || 'Gautham@manipalgroup.info';
const password = process.env.RELGRAPH_QA_PASSWORD || 'Mgroup2015@';

async function trpcCall({ path, input, cookie = '', type = 'query' }) {
  const isQuery = type === 'query';
  const url = new URL(`${baseUrl}/api/trpc/${path}`);
  const headers = cookie ? { cookie } : {};
  let response;

  if (isQuery) {
    if (input !== undefined) {
      url.searchParams.set('input', JSON.stringify({ json: input }));
    }
    response = await fetch(url, {
      method: 'GET',
      headers,
    });
  } else {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ json: input }),
    });
  }

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

function parseCookies(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (!values.length) return '';
  return values.map((value) => value.split(';')[0]).join('; ');
}

function unwrap(result) {
  return result?.result?.data?.json ?? result;
}

const report = {
  baseUrl,
  checks: {},
};

const login = await trpcCall({
  path: 'auth.login',
  input: { email, password },
  type: 'mutation',
});
report.checks.login = {
  status: login.status,
  user: unwrap(login.data)?.user ?? null,
};
if (login.status !== 200 || !unwrap(login.data)?.user) {
  fs.writeFileSync('/home/ubuntu/relgraph/qa_targeted_report.json', JSON.stringify(report, null, 2));
  process.exit(1);
}

const cookie = parseCookies(login.headers);
report.cookieNames = cookie.split('; ').map((entry) => entry.split('=')[0]);

const calls = [
  ['auth.me', undefined, 'authMe', 'query'],
  ['agents.listSchedules', undefined, 'agentSchedules', 'query'],
  ['agents.listRegistry', undefined, 'agentRegistry', 'query'],
  ['apify.listSourceConfigs', { page: 1, pageSize: 50 }, 'apifySources', 'query'],
  ['apify.getIndianBankTargets', undefined, 'bankTargets', 'query'],
  ['today.feed', { limit: 50, includeDismissed: false }, 'todayFeed', 'query'],
  ['watches.list', undefined, 'watchesList', 'query'],
  ['opportunities.list', { page: 1, pageSize: 100, sortOrder: 'desc', isArchived: false }, 'opportunitiesList', 'query'],
  ['today.classify', { utterance: 'Where are we weak in private banks?' }, 'todayClassify', 'query'],
  ['today.command', { utterance: 'Where are we weak in private banks?' }, 'todayCommand', 'mutation'],
  ['chat.geminiToken', undefined, 'geminiToken', 'query'],
];

for (const [path, input, key, type] of calls) {
  const result = await trpcCall({ path, input, cookie, type });
  report.checks[key] = {
    status: result.status,
    data: unwrap(result.data),
  };
}

fs.writeFileSync('/home/ubuntu/relgraph/qa_targeted_report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
