import pick from 'lodash/pick';
import * as qs from 'query-string';

import {URL_PARAM} from 'sentry/constants/pageFilters';

const DEFAULT_STATUS = 'unresolved';

/**
 * Get query for API given the current location.search string
 */
export function getQuery(search: string): Record<string, null | string | string[]> {
  const query = qs.parse(search);

  const status = typeof query.status !== 'undefined' ? query.status : DEFAULT_STATUS;

  const queryParams = {
    status,
    ...pick(query, ['cursor', ...Object.values(URL_PARAM)]),
  };

  return queryParams;
}
