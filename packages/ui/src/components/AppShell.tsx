import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Avatar, Badge, Box, Button, Flex, Heading, Separator, Text } from '@radix-ui/themes';
import { useAuth } from '../contexts/AuthContext';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, role, signOut } = useAuth();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <Flex direction="column" style={{ minHeight: '100svh' }}>
      <Flex
        align="center"
        justify="between"
        px="6"
        py="3"
        style={{
          borderBottom: '1px solid var(--gray-a4)',
          background: 'var(--color-background)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Flex align="center" gap="5">
          <Heading size="4" style={{ letterSpacing: '-0.5px' }}>Muvat</Heading>
          <Separator orientation="vertical" style={{ height: 18 }} />
          <Flex gap="4" align="center">
            <NavLink to="/dashboard" className="nav-link">Dashboard</NavLink>
            <NavLink to="/instances" className="nav-link">Istanze Satispay</NavLink>
          </Flex>
        </Flex>

        <Flex align="center" gap="3">
          <Text size="1" color="gray">{user?.email}</Text>
          {role && (
            <Badge color="violet" variant="soft" size="1" radius="full">
              {role}
            </Badge>
          )}
          <Avatar size="1" fallback={initials} color="violet" radius="full" />
          <Button variant="soft" color="gray" size="1" onClick={signOut}>
            Esci
          </Button>
        </Flex>
      </Flex>

      <Box style={{ flexGrow: 1 }}>
        {children}
      </Box>
    </Flex>
  );
}
