// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ComponentSummary } from '@renderlab/shared-types';
import { ComponentTree } from '../src/components/tree/ComponentTree';

function makeComponent(overrides: Partial<ComponentSummary> = {}): ComponentSummary {
  return {
    componentId: 1,
    displayName: 'SearchBox',
    fiberPath: 'SearchBox',
    renderCount: 5,
    avoidableCount: 0,
    totalDurationMs: 2.5,
    maxDurationMs: 1,
    lastRenderAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ComponentTree', () => {
  it('shows an empty state when there are no components at all', () => {
    render(
      <ComponentTree
        components={[]}
        searchQuery=""
        showOnlyReRendered={false}
        selectedComponentId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/no components match/i)).toBeInTheDocument();
    expect(screen.getByText(/no recorded renders yet/i)).toBeInTheDocument();
  });

  it('shows a distinct empty message when filters exclude everything', () => {
    render(
      <ComponentTree
        components={[makeComponent()]}
        searchQuery="nonexistent"
        showOnlyReRendered={false}
        selectedComponentId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText(/clearing the search/i)).toBeInTheDocument();
  });

  it('filters by search query case-insensitively', () => {
    render(
      <ComponentTree
        components={[
          makeComponent({ displayName: 'SearchBox' }),
          makeComponent({ componentId: 2, displayName: 'Header' }),
        ]}
        searchQuery="search"
        showOnlyReRendered={false}
        selectedComponentId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('SearchBox')).toBeInTheDocument();
    expect(screen.queryByText('Header')).not.toBeInTheDocument();
  });

  it('filters to only components with more than one render when showOnlyReRendered is set', () => {
    render(
      <ComponentTree
        components={[
          makeComponent({ renderCount: 1, displayName: 'Once' }),
          makeComponent({ componentId: 2, renderCount: 3, displayName: 'Thrice' }),
        ]}
        searchQuery=""
        showOnlyReRendered
        selectedComponentId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText('Once')).not.toBeInTheDocument();
    expect(screen.getByText('Thrice')).toBeInTheDocument();
  });

  it('shows an avoidable-count badge only when avoidable renders exist', () => {
    render(
      <ComponentTree
        components={[makeComponent({ avoidableCount: 4 })]}
        searchQuery=""
        showOnlyReRendered={false}
        selectedComponentId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('calls onSelect with the componentId when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <ComponentTree
        components={[makeComponent()]}
        searchQuery=""
        showOnlyReRendered={false}
        selectedComponentId={null}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText('SearchBox'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
