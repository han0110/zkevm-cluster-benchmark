import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipRow } from '@/components/common/ChipToggle';

describe('ChipRow', () => {
  it('renders one pressed-aware chip per item and toggles on click', () => {
    const onToggle = vi.fn();
    render(
      <ChipRow
        items={['failed', 'success']}
        isSelected={item => item === 'failed'}
        onToggle={onToggle}
        getKey={item => item}
        getLabel={item => item}
      />
    );

    const failed = screen.getByRole('button', { name: 'failed' });
    const success = screen.getByRole('button', { name: 'success' });
    expect(failed.getAttribute('aria-pressed')).toBe('true');
    expect(success.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(success);
    expect(onToggle).toHaveBeenCalledWith('success');
  });
});
