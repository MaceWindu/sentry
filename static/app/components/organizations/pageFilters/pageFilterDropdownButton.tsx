import styled from '@emotion/styled';

import DropdownButton from 'sentry/components/dropdownButton';

type Props = {
  /**
   * Highlights the button blue. For page filters this indicates the filter
   * has been desynced from the URL.
   */
  highlighted?: boolean;
};

export default styled(DropdownButton)<Props>`
  width: 100%;
  height: 40px;
  text-overflow: ellipsis;
  ${p =>
    p.highlighted &&
    `
    &,
    &:active,
    &:hover,
    &:focus {
      background-color: ${p.theme.purple100};
      border-color: ${p.theme.purple200};
    }
  `}
`;
