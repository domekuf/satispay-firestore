import { Container, Flex, Heading, Text } from '@radix-ui/themes';
import { AppShell } from '../components/AppShell';
import { CopyableValue } from '../components/CopyableValue';
import { useAuth } from '../contexts/AuthContext';

export function Dashboard() {
  const { user, tenantId } = useAuth();

  return (
    <AppShell>
      <Container size="3" py="8">
        <Flex direction="column" gap="2">
          <Heading size="6">Benvenuto</Heading>
          <Text color="gray" size="3">
            Hai effettuato l&apos;accesso come <strong>{user?.email}</strong>
          </Text>
          <Text color="gray" size="2">
            Tenant:{' '}
            {tenantId ? <CopyableValue value={tenantId} head={1} tail={1} /> : <strong>—</strong>}
          </Text>
        </Flex>
      </Container>
    </AppShell>
  );
}
