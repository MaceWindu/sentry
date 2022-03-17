import styled from '@emotion/styled';

import {fetchTagValues} from 'sentry/actionCreators/tags';
import {Client} from 'sentry/api';
import {SearchBarProps} from 'sentry/components/events/searchBar';
import {PageFilters, TagCollection} from 'sentry/types';
import {getUtcDateString} from 'sentry/utils/dates';
import useOrganization from 'sentry/utils/useOrganization';
import withApi from 'sentry/utils/withApi';
import withIssueTags from 'sentry/utils/withIssueTags';
import {WidgetQuery} from 'sentry/views/dashboardsV2/types';
import IssueListSearchBar from 'sentry/views/issueList/searchBar';

interface Props {
  api: Client;
  onBlur: SearchBarProps['onBlur'];
  onSearch: SearchBarProps['onSearch'];
  query: WidgetQuery;
  selection: PageFilters;
  tags: TagCollection;
}

function IssuesSearchBar({tags, onSearch, onBlur, query, api, selection}: Props) {
  const organization = useOrganization();

  function tagValueLoader(key: string, search: string) {
    const orgId = organization.slug;
    const projectIds = selection.projects.map(id => id.toString());
    const endpointParams = {
      start: getUtcDateString(selection.datetime.start),
      end: getUtcDateString(selection.datetime.end),
      statsPeriod: selection.datetime.period,
    };

    return fetchTagValues(api, orgId, key, search, projectIds, endpointParams);
  }

  return (
    <StyledIssueListSearchBar
      organization={organization}
      query={query.conditions || ''}
      sort=""
      onSearch={onSearch}
      onBlur={onBlur}
      excludeEnvironment
      supportedTags={tags}
      tagValueLoader={tagValueLoader}
      onSidebarToggle={() => undefined}
    />
  );
}

export default withApi(withIssueTags(IssuesSearchBar));

const StyledIssueListSearchBar = styled(IssueListSearchBar)`
  flex-grow: 1;
  button:not([aria-label='Clear search']) {
    display: none;
  }
`;
