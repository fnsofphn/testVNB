import { queries } from './queries';

function assertJsonEqual(actual: unknown, expected: unknown, message: string) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

assertJsonEqual(queries.users(), ['suni', 'users'], 'users query key');
assertJsonEqual(queries.customerUsers(), ['suni', 'users', 'customers'], 'customer users query key');
assertJsonEqual(queries.usersForHelpdesk(), ['suni', 'users', 'helpdesk'], 'helpdesk users query key');
