import { useState, type CSSProperties } from 'react';
import { CheckIcon, ClipboardCopyIcon } from '@radix-ui/react-icons';
import { Button } from '@radix-ui/themes';

export function abbreviateMiddle(value: string, head = 6, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

interface CopyableValueProps {
  value: string;
  head?: number;
  tail?: number;
  block?: boolean;
  monospace?: boolean;
  color?: 'gray' | 'red' | 'amber' | 'green';
  style?: CSSProperties;
}

export function CopyableValue({
  value,
  head = 6,
  tail = 6,
  block = false,
  monospace = true,
  color = 'gray',
  style,
}: CopyableValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Button
      type="button"
      size="1"
      variant="soft"
      color={copied ? 'green' : color}
      title={value}
      onClick={() => void handleCopy()}
      style={{
        maxWidth: '100%',
        justifyContent: 'flex-start',
        width: block ? '100%' : undefined,
        height: block ? 'auto' : undefined,
        whiteSpace: block ? 'normal' : undefined,
        ...style,
      }}
    >
      {copied ? <CheckIcon /> : <ClipboardCopyIcon />}
      <span
        style={{
          fontFamily: monospace ? 'monospace' : undefined,
          overflowWrap: block ? 'anywhere' : undefined,
          wordBreak: block ? 'break-all' : undefined,
          textAlign: 'left',
        }}
      >
        {abbreviateMiddle(value, head, tail)}
      </span>
    </Button>
  );
}
