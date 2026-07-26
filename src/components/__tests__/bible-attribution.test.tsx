import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BibleAttribution } from '../BibleAttribution';

describe('unified Bible attribution footer', () => {
  it('renders every displayed translation in one footer', () => {
    render(
      <BibleAttribution
        attributions={[
          {
            abbreviation: 'NIV',
            title: 'New International Version',
            copyright: 'Required NIV copyright.',
            sourceLabel: 'YouVersion',
            sourceUrl: 'https://www.bible.com/versions/111',
          },
          {
            abbreviation: 'CUV',
            title: 'Chinese Union Version',
            copyright: 'Public Domain',
          },
        ]}
      />,
    );

    const footer = screen.getByRole('contentinfo', {
      name: 'Bible translation copyright',
    });
    expect(footer).toHaveTextContent('Required NIV copyright.');
    expect(footer).toHaveTextContent('Chinese Union Version (CUV)');
    expect(screen.getByRole('link', { name: 'YouVersion' })).toHaveAttribute(
      'href',
      'https://www.bible.com/versions/111',
    );
  });
});

